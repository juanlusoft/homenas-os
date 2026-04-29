import { apiFetch } from './client'

export type DdnsProvider = 'duckdns' | 'noip' | 'cloudflare' | 'dynu'

export interface DdnsConfig {
  id: number
  provider: DdnsProvider
  domain: string
  token: string
  username: string | null
  enabled: boolean
  lastUpdate: number | null
  lastIp: string | null
  lastStatus: string
  createdAt: number
}

export interface DdnsConfigInput {
  provider: DdnsProvider
  domain: string
  token: string
  username?: string
  enabled?: boolean
}

export interface DdnsUpdateResult {
  ip: string
  results: Array<{ id: number; domain: string; status: string }>
}

export const ddnsApi = {
  getStatus: (): Promise<DdnsConfig[]> =>
    apiFetch('/ddns/status'),

  getConfigs: (): Promise<DdnsConfig[]> =>
    apiFetch('/ddns/configs'),

  addConfig: (input: DdnsConfigInput): Promise<DdnsConfig> =>
    apiFetch('/ddns/configs', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  removeConfig: (id: number): Promise<{ ok: boolean }> =>
    apiFetch(`/ddns/configs/${id}`, {
      method: 'DELETE',
    }),

  updateNow: (): Promise<DdnsUpdateResult> =>
    apiFetch('/ddns/update-now', {
      method: 'POST',
    }),
}
