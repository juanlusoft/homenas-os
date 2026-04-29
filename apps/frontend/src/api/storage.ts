import { apiFetch } from './client'
import type {
  Disk,
  SnapRaidStatus,
  MergerFSStatus,
  BadblocksStatus,
  StartSnapRaidInput,
  StartBadblocksInput,
  DiskPartition,
} from '@homenas/shared'

export type { DiskPartition }

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

  // Disk management (unconfigured disks)
  getDiskPartitions: (diskName: string): Promise<DiskPartition[]> =>
    apiFetch(`/storage/disks/${diskName}/partitions`),

  mountPartition: (diskName: string, body: { browserId: string }): Promise<{ mountPoint: string }> =>
    apiFetch(`/storage/disks/${diskName}/mount`, { method: 'POST', body: JSON.stringify(body) }),

  unmountPartition: (diskName: string, body: { browserId: string }): Promise<void> =>
    apiFetch(`/storage/disks/${diskName}/unmount`, { method: 'POST', body: JSON.stringify(body) }),

  addDiskToPool: (diskName: string): Promise<{ mountPoint: string; poolUpdated: boolean }> =>
    apiFetch(`/storage/disks/${diskName}/add-to-pool`, { method: 'POST', body: '{}' }),

  createPool: (body: { devices: string[] }): Promise<{ poolMount: string; drives: string[] }> =>
    apiFetch('/storage/pool/create', { method: 'POST', body: JSON.stringify(body) }),
}
