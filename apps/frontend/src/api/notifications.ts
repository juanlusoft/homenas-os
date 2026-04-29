import { apiFetch } from './client'

export interface EmailConfig {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  from: string
  to: string
}

export interface TelegramConfig {
  enabled: boolean
  token: string
  chatId: string
}

export interface NotificationsConfig {
  email: EmailConfig
  telegram: TelegramConfig
  onLogin: boolean
}

export const notificationsApi = {
  getConfig: () => apiFetch<NotificationsConfig>('/notifications/config'),

  updateEmail: (data: Partial<EmailConfig>) =>
    apiFetch<{ ok: boolean }>('/notifications/email', { method: 'PUT', body: JSON.stringify(data) }),

  updateTelegram: (data: Partial<TelegramConfig>) =>
    apiFetch<{ ok: boolean }>('/notifications/telegram', { method: 'PUT', body: JSON.stringify(data) }),

  updateSettings: (data: { onLogin?: boolean }) =>
    apiFetch<{ ok: boolean }>('/notifications/settings', { method: 'PUT', body: JSON.stringify(data) }),

  test: () =>
    apiFetch<{ ok: boolean }>('/notifications/test', { method: 'POST' }),
}
