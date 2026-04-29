import { apiFetch } from './client'
import type { LoginInput } from '@homenas/shared'

export const authApi = {
  login: (data: LoginInput) => apiFetch<{ sessionId: string; csrfToken: string; user: { id: number; username: string; role: 'admin' | 'user' } }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  logout: () => apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => apiFetch<{ id: number; username: string; role: 'admin' | 'user' }>('/auth/me'),

  totp: {
    status: () => apiFetch<{ enabled: boolean }>('/auth/totp/status'),
    setup: () => apiFetch<{ secret: string; uri: string; qrDataUrl: string }>('/auth/totp/setup', { method: 'POST' }),
    enable: (code: string) => apiFetch<{ ok: boolean }>('/auth/totp/enable', { method: 'POST', body: JSON.stringify({ code }) }),
    disable: (password: string) => apiFetch<{ ok: boolean }>('/auth/totp/disable', { method: 'POST', body: JSON.stringify({ password }) }),
  },
}
