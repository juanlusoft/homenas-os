import { apiFetch } from './client'
import type { AbDevice, AbBackupRun, AbProgress, AbFileEntry } from '@homenas/shared'

export interface DeviceDetail {
  device: AbDevice
  runs: AbBackupRun[]
}

export interface VersionEntry {
  version: string
  path: string
}

export const activeBackupApi = {
  // ── Admin ────────────────────────────────────────────────────────────────

  listDevices: (): Promise<AbDevice[]> =>
    apiFetch<{ items: AbDevice[]; total: number }>('/active-backup/devices').then(r => r.items),

  getDevice: (id: number): Promise<DeviceDetail> =>
    apiFetch(`/active-backup/devices/${id}`),

  approveDevice: (id: number): Promise<AbDevice> =>
    apiFetch(`/active-backup/devices/${id}/approve`, { method: 'POST' }),

  deleteDevice: (id: number): Promise<{ ok: boolean }> =>
    apiFetch(`/active-backup/devices/${id}`, { method: 'DELETE' }),

  triggerBackup: (id: number): Promise<{ run_id: number }> =>
    apiFetch(`/active-backup/devices/${id}/backup`, { method: 'POST' }),

  getProgress: (id: number): Promise<AbProgress> =>
    apiFetch(`/active-backup/devices/${id}/progress`),

  cancelBackup: (id: number): Promise<{ ok: boolean }> =>
    apiFetch(`/active-backup/devices/${id}/cancel`, { method: 'POST' }),

  listVersions: (id: number): Promise<VersionEntry[]> =>
    apiFetch(`/active-backup/devices/${id}/versions`),

  browseFiles: (id: number, version: string, path: string): Promise<AbFileEntry[]> =>
    apiFetch(`/active-backup/devices/${id}/browse?version=${encodeURIComponent(version)}&path=${encodeURIComponent(path)}`),

  createDevice: (input: { name: string; hostname?: string | null; os_type: 'windows' | 'mac' | 'linux' }): Promise<AbDevice> =>
    apiFetch('/active-backup/devices', { method: 'POST', body: JSON.stringify(input) }),

  downloadRestoreFile: async (id: number, version: string, filePath: string): Promise<void> => {
    const { useAuthStore } = await import('../stores/authStore')
    const sessionId = useAuthStore.getState().sessionId
    const res = await fetch(
      `/api/active-backup/devices/${id}/restore/download?version=${encodeURIComponent(version)}&path=${encodeURIComponent(filePath)}`,
      { headers: { 'X-Session-Id': sessionId ?? '' } }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Error desconocido' }))
      throw new Error(err.message ?? 'Error al descargar')
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const filename = filePath.split('/').pop() ?? 'file'
    a.download = filename
    a.click()
    // Firefox sometimes revokes the URL before the download stream has actually
    // started — defer the cleanup so the click() handler has time to kick in.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },

  downloadAgentPackage: async (id: number, platform: 'windows' | 'linux' | 'mac', deviceName: string): Promise<void> => {
    const { useAuthStore } = await import('../stores/authStore')
    const sessionId = useAuthStore.getState().sessionId
    const res = await fetch(`/api/active-backup/devices/${id}/agent-package?platform=${platform}`, {
      headers: { 'X-Session-Id': sessionId ?? '' },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Error desconocido' }))
      throw new Error(err.message ?? 'Error al generar el paquete')
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `homenas-agent-${deviceName}-${platform}.zip`
    a.click()
    // See note in downloadRestoreFile — defer revoke so Firefox doesn't kill
    // the download mid-flight.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
