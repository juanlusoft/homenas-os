import { useAuthStore } from '../stores/authStore'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly body: unknown = null) {
    super(message)
    this.name = 'ApiError'
  }

  get requireTotp(): boolean {
    return typeof this.body === 'object' && this.body !== null &&
      'requireTotp' in this.body && this.body.requireTotp === true
  }
}

// Preserve machine-readable flags (e.g. the login TOTP challenge) as well as
// the backend's message. HTML proxy errors are kept short for the UI.
async function responseError(res: Response): Promise<ApiError> {
  const raw = await res.text()
  let body: unknown = null
  try { body = JSON.parse(raw) } catch { /* text response */ }
  const envelope = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const message = typeof envelope.message === 'string' ? envelope.message
    : typeof envelope.error === 'string' ? envelope.error
    : raw.trim().slice(0, 200) || `HTTP ${res.status}`
  return new ApiError(message, res.status, body)
}

// A delayed failure from an old session must not log out a newly signed-in user.
export function invalidateSession(sessionId: string | null) {
  if (sessionId && useAuthStore.getState().sessionId === sessionId) {
    useAuthStore.getState().logout()
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { sessionId, csrfToken } = useAuthStore.getState()
  const method = (options?.method ?? 'GET').toUpperCase()
  const isMutating = !SAFE_METHODS.has(method)

  const headers = new Headers(options?.headers)
  // Fastify rejects empty JSON bodies; FormData needs its browser-generated boundary.
  if (options?.body != null && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (sessionId) headers.set('X-Session-Id', sessionId)
  if (isMutating && csrfToken) headers.set('X-CSRF-Token', csrfToken)
  const res = await fetch(`/api${path}`, { ...options, headers })
  if (res.status === 401 && path !== '/auth/login') invalidateSession(sessionId)
  if (!res.ok) throw await responseError(res)
  return res.json()
}

// Silent fetch for background checks — does not throw on non-2xx so callers
// can inspect the Response themselves. Mirrors `apiFetch` for the 401 case:
// if the session is no longer valid we proactively log the user out (the
// store handles any redirect side-effect) but we still return the response
// instead of raising, so the caller's loop can decide what to do.
export async function silentFetch(path: string): Promise<Response> {
  const { sessionId } = useAuthStore.getState()
  const res = await fetch(`/api${path}`, {
    headers: sessionId ? { 'X-Session-Id': sessionId } : {}
  })
  if (res.status === 401) invalidateSession(sessionId)
  return res
}
