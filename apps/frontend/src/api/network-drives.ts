import { apiFetch } from './client'

export type DriveType = 'webdav' | 'sftp' | 's3' | 'smb' | 'ftp' | 'b2'

export interface NetworkDrive {
  id: number
  name: string
  type: DriveType
  config: Record<string, string>
  mount_point: string
  is_mounted: number
  auto_mount: number
  created_at: number
}

export interface AddDriveInput {
  name: string
  type: DriveType
  config: Record<string, string>
  auto_mount?: boolean
}

export const networkDrivesApi = {
  list: (): Promise<NetworkDrive[]> =>
    apiFetch<{ items: NetworkDrive[] }>('/network-drives').then(r => r.items),

  add: (input: AddDriveInput): Promise<NetworkDrive> =>
    apiFetch('/network-drives', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  delete: (id: number): Promise<{ ok: boolean }> =>
    apiFetch(`/network-drives/${id}`, { method: 'DELETE' }),

  mount: (id: number): Promise<{ ok: boolean }> =>
    apiFetch(`/network-drives/${id}/mount`, { method: 'POST' }),

  unmount: (id: number): Promise<{ ok: boolean }> =>
    apiFetch(`/network-drives/${id}/unmount`, { method: 'POST' }),
}
