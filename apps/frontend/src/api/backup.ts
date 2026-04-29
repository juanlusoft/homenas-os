import { apiFetch } from './client'
import type {
  BackupJob,
  BackupRun,
  BackupProgress,
  CreateBackupJobInput,
} from '@homenas/shared'

export const backupApi = {
  // Jobs
  listJobs: (): Promise<BackupJob[]> =>
    apiFetch('/backup/jobs'),

  createJob: (body: CreateBackupJobInput): Promise<BackupJob> =>
    apiFetch('/backup/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateJob: (id: number, body: Partial<CreateBackupJobInput>): Promise<BackupJob> =>
    apiFetch(`/backup/jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteJob: (id: number): Promise<{ ok: boolean }> =>
    apiFetch(`/backup/jobs/${id}`, { method: 'DELETE' }),

  runJob: (id: number): Promise<{ started: true }> =>
    apiFetch(`/backup/jobs/${id}/run`, { method: 'POST' }),

  getProgress: (): Promise<BackupProgress> =>
    apiFetch('/backup/progress'),

  getHistory: (jobId: number): Promise<BackupRun[]> =>
    apiFetch(`/backup/jobs/${jobId}/history`),

  cancelBackup: (): Promise<{ ok: boolean }> =>
    apiFetch('/backup/cancel', { method: 'POST' }),
}
