import { z } from 'zod'

export const DiskSchema = z.object({
  device: z.string(),         // e.g. /dev/sda
  name: z.string(),           // e.g. sda
  diskType: z.enum(['nvme', 'ssd', 'hdd', 'usb', 'other']),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  sizeBytes: z.number(),
  usedBytes: z.number().nullable(),
  fsType: z.string().nullable(),
  mountPoint: z.string().nullable(),
  smart: z.object({
    healthy: z.boolean(),
    temperature: z.number().nullable(),
    powerOnHours: z.number().nullable(),
    reallocatedSectors: z.number().nullable(),
  }).nullable(),
})

export const SnapRaidStatusSchema = z.object({
  configured: z.boolean(),           // true if /etc/snapraid.conf exists
  running: z.boolean(),
  operation: z.enum(['sync', 'scrub', 'fix', 'check', 'idle']),
  progress: z.number().min(0).max(100),
  status: z.string(),
  error: z.string().nullable(),
  lastSync: z.number().nullable(),   // unix timestamp
  lastScrub: z.number().nullable(),
})

export const MergerFSDriveSchema = z.object({
  path: z.string(),
  role: z.enum(['data', 'cache', 'unknown']),
  totalBytes: z.number().nullable(),
  usedBytes: z.number().nullable(),
})

export const MergerFSStatusSchema = z.object({
  mounted: z.boolean(),
  mountPoint: z.string(),
  drives: z.array(MergerFSDriveSchema),
  totalBytes: z.number().nullable(),
  usedBytes: z.number().nullable(),
})

export type MergerFSDrive = z.infer<typeof MergerFSDriveSchema>

export const BadblocksStatusSchema = z.object({
  running: z.boolean(),
  device: z.string().nullable(),
  progress: z.number().min(0).max(100),
  blocksChecked: z.number(),
  badBlocks: z.number(),
  status: z.string(),
  error: z.string().nullable(),
})

export const StartSnapRaidSchema = z.object({
  operation: z.enum(['sync', 'scrub', 'fix', 'check']),
})

export const StartBadblocksSchema = z.object({
  device: z.string().regex(/^\/dev\/[a-z0-9]+$/),  // strict validation
  writeMode: z.boolean().default(false),
})

export type Disk = z.infer<typeof DiskSchema>
export type SnapRaidStatus = z.infer<typeof SnapRaidStatusSchema>
export type MergerFSStatus = z.infer<typeof MergerFSStatusSchema>
export type BadblocksStatus = z.infer<typeof BadblocksStatusSchema>
export type StartSnapRaidInput = z.infer<typeof StartSnapRaidSchema>
export type StartBadblocksInput = z.infer<typeof StartBadblocksSchema>
