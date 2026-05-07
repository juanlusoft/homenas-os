import { useAuthStore } from '../stores/authStore'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Pulls a useful, short error message out of a non-2xx response.
// - If the body looks like our standard JSON error envelope ({ message } /
//   { error }), use that.
// - Otherwise fall back to the raw text but truncate it so we don't render a
//   full HTML error page in a toast/alert.
async function extractErrorMessage(res: Response): Promise<string> {
  const raw = await res.text()
  if (!raw) return `HTTP ${res.status}`
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; error?: unknown }
    const msg = typeof parsed.message === 'string' ? parsed.message
              : typeof parsed.error   === 'string' ? parsed.error
              : null
    if (msg) return msg
  } catch {
    // not JSON — fall through to truncated text
  }
  const trimmed = raw.trim()
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { sessionId, csrfToken } = useAuthStore.getState()
  const method = (options?.method ?? 'GET').toUpperCase()
  const isMutating = !SAFE_METHODS.has(method)

  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      // Only set Content-Type if there's a body — Fastify rejects empty JSON bodies
      ...(options?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
      ...(isMutating && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options?.headers,
    }
  })
  if (res.status === 401) {
    useAuthStore.getState().logout()
    throw new Error('UNAUTHORIZED')
  }
  if (!res.ok) throw new Error(await extractErrorMessage(res))
  return res.json()
}

// Silent fetch for background checks — does NOT trigger logout on 401
export async function silentFetch(path: string): Promise<Response> {
  const { sessionId } = useAuthStore.getState()
  return fetch(`/api${path}`, {
    headers: sessionId ? { 'X-Session-Id': sessionId } : {}
  })
}
