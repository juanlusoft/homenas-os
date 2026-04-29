import { apiFetch } from './client'
import { useAuthStore } from '../stores/authStore'
import type { SystemMetrics, SystemInfo } from '@homenas/shared'

export interface AuditEntry {
  id: number
  user_id: number | null
  username: string
  action: string
  detail: string | null
  ip: string
  created_at: number
}

export interface AuditLogResponse {
  items: AuditEntry[]
  total: number
  limit: number
  offset: number
}

export const systemApi = {
  getMetrics: () => apiFetch<SystemMetrics>('/system/metrics'),
  getInfo:    () => apiFetch<SystemInfo>('/system/info'),
  reboot:     () => apiFetch<{ ok: boolean }>('/system/reboot', { method: 'POST' }),

  ssh: {
    status:  () => apiFetch<{ active: boolean; service: string }>('/system/ssh'),
    enable:  () => apiFetch<{ ok: boolean }>('/system/ssh/enable',  { method: 'POST' }),
    disable: () => apiFetch<{ ok: boolean }>('/system/ssh/disable', { method: 'POST' }),
  },

  db: {
    integrity: () => apiFetch<{ ok: boolean; details: string[] }>('/system/db-integrity', { method: 'POST' }),

    backup: async () => {
      const { sessionId } = useAuthStore.getState()
      const res = await fetch('/api/system/db-backup', {
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      })
      if (res.status === 401) { useAuthStore.getState().logout(); throw new Error('UNAUTHORIZED') }
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'homenas.db'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
  },

  auditLog: (limit = 100, offset = 0) =>
    apiFetch<AuditLogResponse>(`/system/audit-log?limit=${limit}&offset=${offset}`),
}
