import { apiFetch } from './client'
import type { SystemInfo, UpsStatus, Notification } from '@homenas/shared'

export const systemInfoApi = {
  getInfo: () => apiFetch<SystemInfo>('/system/info'),
  getUps: () => apiFetch<UpsStatus>('/system/ups'),
  getNotifications: () => apiFetch<Notification[]>('/system/notifications'),
  markAsRead: (id: number) =>
    apiFetch<{ ok: boolean }>(`/system/notifications/${id}/read`, { method: 'POST' }),
}
