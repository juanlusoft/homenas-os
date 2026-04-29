import { apiFetch } from './client'
import type { CatalogApp, InstallPayload, UninstallPayload, AppLogsResponse } from '@homenas/shared'

export const homestoreApi = {
  // GET /api/homestore/catalog
  getCatalog: (): Promise<CatalogApp[]> =>
    apiFetch('/homestore/catalog'),

  // POST /api/homestore/install/:id
  installApp: (id: string, payload: InstallPayload): Promise<{ success: boolean }> =>
    apiFetch(`/homestore/install/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // POST /api/homestore/uninstall/:id
  uninstallApp: (id: string, payload: UninstallPayload): Promise<{ success: boolean }> =>
    apiFetch(`/homestore/uninstall/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // POST /api/homestore/start/:id
  startApp: (id: string): Promise<{ success: boolean }> =>
    apiFetch(`/homestore/start/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({}) }),

  // POST /api/homestore/stop/:id
  stopApp: (id: string): Promise<{ success: boolean }> =>
    apiFetch(`/homestore/stop/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({}) }),

  // POST /api/homestore/restart/:id
  restartApp: (id: string): Promise<{ success: boolean }> =>
    apiFetch(`/homestore/restart/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({}) }),

  // POST /api/homestore/update/:id
  updateApp: (id: string): Promise<{ success: boolean }> =>
    apiFetch(`/homestore/update/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({}) }),

  // GET /api/homestore/logs/:id
  getAppLogs: (id: string): Promise<AppLogsResponse> =>
    apiFetch(`/homestore/logs/${encodeURIComponent(id)}`),
}
