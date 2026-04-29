import { apiFetch } from './client'
import type { CloudflareStatus } from '@homenas/shared'

export const cloudflareApi = {
  getStatus: () => apiFetch<CloudflareStatus>('/network/cloudflare/status'),
  configure: (token: string) => apiFetch<CloudflareStatus>('/network/cloudflare/configure', {
    method: 'POST',
    body: JSON.stringify({ token }),
  }),
  start: () => apiFetch<void>('/network/cloudflare/start', { method: 'POST' }),
  stop: () => apiFetch<void>('/network/cloudflare/stop', { method: 'POST' }),
  remove: () => apiFetch<{ ok: boolean }>('/network/cloudflare/remove', { method: 'POST' }),
}
