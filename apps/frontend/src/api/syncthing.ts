import { apiFetch } from './client'

export interface SyncthingStatus {
  installed: boolean
  active: boolean
  deviceId: string | null
  apiKey: string | null
  version: string | null
}

export interface SyncthingDevice {
  deviceID: string
  name: string
  addresses: string[]
  paused: boolean
}

export interface SyncthingFolder {
  id: string
  label: string
  path: string
  devices: Array<{ deviceID: string }>
  type: string
  paused: boolean
}

export interface FolderSyncStatus {
  folderId: string
  completion: number
  needBytes: number
  globalBytes: number
}

export const syncthingApi = {
  getStatus: (): Promise<SyncthingStatus> =>
    apiFetch('/syncthing/status'),

  install: (): Promise<{ ok: boolean }> =>
    apiFetch('/syncthing/install', { method: 'POST' }),

  start: (): Promise<{ ok: boolean }> =>
    apiFetch('/syncthing/start', { method: 'POST' }),

  stop: (): Promise<{ ok: boolean }> =>
    apiFetch('/syncthing/stop', { method: 'POST' }),

  // Devices
  listDevices: (): Promise<SyncthingDevice[]> =>
    apiFetch('/syncthing/devices'),

  addDevice: (deviceId: string, name: string): Promise<{ ok: boolean }> =>
    apiFetch('/syncthing/devices', {
      method: 'POST',
      body: JSON.stringify({ deviceId, name }),
    }),

  removeDevice: (deviceId: string): Promise<{ ok: boolean }> =>
    apiFetch(`/syncthing/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }),

  // Folders
  listFolders: (): Promise<SyncthingFolder[]> =>
    apiFetch('/syncthing/folders'),

  addFolder: (id: string, path: string, sharedWithDevices: string[]): Promise<{ ok: boolean }> =>
    apiFetch('/syncthing/folders', {
      method: 'POST',
      body: JSON.stringify({ id, path, sharedWithDevices }),
    }),

  removeFolder: (id: string): Promise<{ ok: boolean }> =>
    apiFetch(`/syncthing/folders/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Sync status
  getSyncStatus: (): Promise<FolderSyncStatus[]> =>
    apiFetch('/syncthing/sync-status'),
}
