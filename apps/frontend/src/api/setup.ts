import { apiFetch } from './client'

// Note: getSetupStatus uses fetch directly (no auth required)
export const setupApi = {
  getStatus: async (): Promise<{ complete: boolean }> => {
    const res = await fetch('/api/setup/status')
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  autologin: async (): Promise<{ sessionId: string; csrfToken: string; user: { id: number; username: string; role: 'admin' | 'user' } }> => {
    const res = await fetch('/api/setup/autologin', { method: 'POST' })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  changeAccount: (username: string, newPassword: string, confirmPassword: string) =>
    apiFetch<{ ok: boolean; username: string }>('/setup/account', {
      method: 'POST',
      body: JSON.stringify({ username, newPassword, confirmPassword }),
    }),

  changePassword: (newPassword: string, confirmPassword: string) =>
    apiFetch<{ ok: boolean }>('/setup/password', {
      method: 'POST',
      body: JSON.stringify({ newPassword, confirmPassword }),
    }),

  getNetwork: () =>
    apiFetch<{
      interfaces: { name: string; ip: string | null; isDhcp: boolean }[]
    }>('/setup/network'),

  configureNetwork: (payload: {
    interface: string
    mode: 'dhcp' | 'static'
    ip?: string
    prefix?: number
    gateway?: string
    dns?: string
  }) =>
    apiFetch<{ ok: boolean }>('/setup/network', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  configurePool: (payload: {
    disks: { device: string; role: 'data' | 'parity' | 'cache' }[]
    fsType: 'ext4' | 'xfs'
    poolType: 'single' | 'mergerfs' | 'snapraid'
  }) =>
    apiFetch<{ ok: boolean }>('/setup/pool', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  complete: () => apiFetch<{ ok: boolean }>('/setup/complete', { method: 'POST', body: '{}' }),
}
