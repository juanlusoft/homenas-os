import { apiFetch } from './client'
import type {
  CatalogApp,
  InstallPayload,
  UninstallPayload,
  AppLogsResponse,
  EditPayload,
  EditResponse,
  EffectiveContainerConfig,
} from '@homenas/shared'

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

  // PATCH /api/containers/:id
  //
  // Edits an installed HomeStore container. Always returns the discriminated
  // union from `EditResponseSchema` on HTTP 200. 4xx/5xx responses bubble up as
  // a thrown Error from `apiFetch` (the body is the raw text — typically
  // `{ error, message }` — so the caller is expected to catch and surface it).
  editApp: (id: string, payload: EditPayload): Promise<EditResponse> =>
    apiFetch(`/containers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // GET /api/containers/:id/config
  //
  // Persisted runtime config for an installed HomeStore container — used by
  // the edit modal to prefill fields with real values instead of catalog
  // defaults. 404 when the app is not installed.
  getContainerConfig: (id: string): Promise<EffectiveContainerConfig> =>
    apiFetch(`/containers/${encodeURIComponent(id)}/config`),

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
