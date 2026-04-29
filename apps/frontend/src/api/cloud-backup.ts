import { apiFetch } from './client'

export type RemoteType =
  | 'gdrive'
  | 'dropbox'
  | 'onedrive'
  | 's3'
  | 'b2'
  | 'mega'
  | 'sftp'
  | 'ftp'
  | 'webdav'

export type JobOperation = 'sync' | 'copy' | 'move'

export interface CloudRemote {
  id: number
  name: string
  type: RemoteType
  config: string
  configParsed?: Record<string, string>
  created_at: number
}

export interface CloudJob {
  id: number
  name: string
  remote_id: number
  operation: JobOperation
  source: string
  destination: string
  cron_expression: string | null
  enabled: number
  last_run: number | null
  last_status: string
  created_at: number
}

export interface CloudTransfer {
  id: number
  job_id: number
  started_at: number
  finished_at: number | null
  status: string
  transferred_bytes: number | null
  error_message: string | null
}

export interface TransferProgress {
  running: boolean
  jobId: number | null
  transferId: number | null
  outputLines: string[]
  percent: number
}

export interface RemoteInfo {
  total: number | null
  used: number | null
  free: number | null
}

export interface CreateRemoteInput {
  name: string
  type: RemoteType
  config: Record<string, string>
}

export interface CreateJobInput {
  name: string
  remote_id: number
  operation: JobOperation
  source: string
  destination: string
  cron_expression?: string | null
  enabled?: number
}

export const cloudBackupApi = {
  // Status
  getStatus: (): Promise<{ installed: boolean; version: string | null }> =>
    apiFetch('/cloud-backup/status'),

  install: (): Promise<{ ok: boolean }> =>
    apiFetch('/cloud-backup/install', { method: 'POST' }),

  // Remotes
  listRemotes: (): Promise<CloudRemote[]> =>
    apiFetch('/cloud-backup/remotes'),

  configureRemote: (input: CreateRemoteInput): Promise<CloudRemote> =>
    apiFetch('/cloud-backup/remotes', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  deleteRemote: (name: string): Promise<{ ok: boolean }> =>
    apiFetch(`/cloud-backup/remotes/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  getRemoteInfo: (name: string): Promise<RemoteInfo> =>
    apiFetch(`/cloud-backup/remotes/${encodeURIComponent(name)}/info`),

  // Jobs
  listJobs: (): Promise<CloudJob[]> =>
    apiFetch('/cloud-backup/jobs'),

  createJob: (input: CreateJobInput): Promise<CloudJob> =>
    apiFetch('/cloud-backup/jobs', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateJob: (id: number, input: Partial<CreateJobInput>): Promise<CloudJob> =>
    apiFetch(`/cloud-backup/jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  deleteJob: (id: number): Promise<{ ok: boolean }> =>
    apiFetch(`/cloud-backup/jobs/${id}`, { method: 'DELETE' }),

  runJob: (id: number): Promise<{ started: true }> =>
    apiFetch(`/cloud-backup/jobs/${id}/run`, { method: 'POST' }),

  // Transfer
  getProgress: (): Promise<TransferProgress> =>
    apiFetch('/cloud-backup/transfer/progress'),

  cancelTransfer: (): Promise<{ ok: boolean }> =>
    apiFetch('/cloud-backup/transfer/cancel', { method: 'POST' }),

  // History
  listTransfers: (): Promise<CloudTransfer[]> =>
    apiFetch('/cloud-backup/transfers'),
}
