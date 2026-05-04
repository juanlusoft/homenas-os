import { apiFetch } from './client'

export type UpdateProcessStatus = 'idle' | 'updating' | 'done' | 'error'

export interface AppUpdateInfo {
  currentCommit: string
  pendingCommits: string[]
}

export interface OsPackage {
  name: string
  currentVersion: string
  newVersion: string
  description: string
}

export interface OsUpdateInfo {
  packages: OsPackage[]
}

export interface UpdateProcessState {
  status: UpdateProcessStatus
  type: 'app' | 'os' | null
  output: string
  startedAt: number | null
  finishedAt: number | null
  error: string | null
}

export interface UpdateStatus {
  app: AppUpdateInfo
  os: OsUpdateInfo
  process: UpdateProcessState
}

export interface AutoUpdateConfig {
  enabled: boolean
  intervalMinutes: number
  lastCheckAt: number | null
  lastApplyAt: number | null
}

export const updatesApi = {
  getStatus: (): Promise<UpdateStatus> =>
    apiFetch('/updates/status'),

  getProcess: (): Promise<UpdateProcessState> =>
    apiFetch('/updates/process'),

  updateApp: (): Promise<{ ok: boolean; message: string }> =>
    apiFetch('/updates/app', { method: 'POST' }),

  updateOs: (packages?: string[]): Promise<{ ok: boolean; message: string }> =>
    apiFetch('/updates/os', {
      method: 'POST',
      body: JSON.stringify({ packages: packages ?? [] }),
    }),

  getAutoConfig: (): Promise<AutoUpdateConfig> =>
    apiFetch('/updates/auto'),

  setAutoConfig: (body: { enabled: boolean; intervalMinutes: number }): Promise<AutoUpdateConfig> =>
    apiFetch('/updates/auto', { method: 'POST', body: JSON.stringify(body) }),
}
