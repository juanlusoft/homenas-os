import { useAuthStore } from '../stores/authStore'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

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
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// Silent fetch for background checks — does NOT trigger logout on 401
export async function silentFetch(path: string): Promise<Response> {
  const { sessionId } = useAuthStore.getState()
  return fetch(`/api${path}`, {
    headers: sessionId ? { 'X-Session-Id': sessionId } : {}
  })
}
