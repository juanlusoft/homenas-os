import { apiFetch } from './client'
import type {
  Disk,
  SnapRaidStatus,
  MergerFSStatus,
  BadblocksStatus,
  StartSnapRaidInput,
  StartBadblocksInput,
} from '@homenas/shared'

export interface DiskIoStat {
  diskId: string
  readMBs: number
  writeMBs: number
  ioErrors: number
}

export const storageApi = {
  // Disks
  listDisks: (): Promise<Disk[]> =>
    apiFetch('/storage/disks'),

  getIoStats: (diskIds: string[]): Promise<{ disks: DiskIoStat[] }> =>
    apiFetch(`/storage/disks/iostats?disks=${diskIds.join(',')}`),

  // SnapRAID
  getSnapRaidStatus: (): Promise<SnapRaidStatus> =>
    apiFetch('/storage/snapraid/status'),

  startSnapRaid: (body: StartSnapRaidInput): Promise<{ started: boolean; operation: string }> =>
    apiFetch('/storage/snapraid/start', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  stopSnapRaid: (): Promise<{ stopped: boolean }> =>
    apiFetch('/storage/snapraid/stop', { method: 'POST' }),

  // MergerFS
  getMergerFSStatus: (): Promise<MergerFSStatus> =>
    apiFetch('/storage/mergerfs/status'),

  drainMergerFSCache: (): Promise<{ ok: boolean }> =>
    apiFetch('/storage/mergerfs/drain', { method: 'POST', body: '{}' }),

  // Badblocks
  getBadblocksStatus: (): Promise<BadblocksStatus> =>
    apiFetch('/storage/badblocks/status'),

  startBadblocks: (body: StartBadblocksInput): Promise<{ started: boolean; device: string; writeMode: boolean }> =>
    apiFetch('/storage/badblocks/start', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  stopBadblocks: (): Promise<{ stopped: boolean }> =>
    apiFetch('/storage/badblocks/stop', { method: 'POST' }),
}
