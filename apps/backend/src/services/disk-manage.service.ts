import { mkdirSync, readFileSync } from 'node:fs'
import { assertSafeToFormat, withFormatLock } from './storage-safety.js'
import { exec, writeFileAsRoot } from '../lib/exec.js'
import type { DiskPartition } from '@homenas/shared'

// ─── Security ─────────────────────────────────────────────────────────────────

// Strict — matches setup-pool.service.ts. Accepts:
//   /dev/sda, /dev/sda1   (SCSI / SATA)
//   /dev/nvme0n1, /dev/nvme0n1p1   (NVMe with namespace + partition)
//   /dev/mmcblk0, /dev/mmcblk0p1   (eMMC / SD)
//   /dev/vda, /dev/xvda, /dev/hda  (virtual / Xen / IDE)
// Rejects junk like /dev/aaaaa or /dev/sda99zzz.
const DEVICE_RE = /^\/dev\/(?:sd[a-z]{1,2}\d{0,2}|nvme\d+n\d+(?:p\d+)?|mmcblk\d+(?:p\d+)?|[hvx]d[a-z]\d{0,2})$/
const BROWSER_ID_RE = /^[a-z0-9_-]{1,32}$/

function validateDevice(device: string): void {
  if (!DEVICE_RE.test(device)) {
    throw new Error(`Invalid device path: ${device}`)
  }
}

function validateBrowserId(browserId: string): void {
  if (!BROWSER_ID_RE.test(browserId)) {
    throw new Error(`Invalid browserId: ${browserId}`)
  }
}

// ─── lsblk partition output types ────────────────────────────────────────────

interface LsblkPartition {
  name: string
  size: string | number
  fstype: string | null
  parttypename: string | null
  type: string
}

interface LsblkPartOutput {
  blockdevices: Array<{
    name: string
    size: string | number
    fstype: string | null
    parttypename: string | null
    type: string
    children?: LsblkPartition[]
  }>
}

function parseSizeToBytes(size: string | number): number {
  if (typeof size === 'number') return size
  if (!size) return 0
  const units: Record<string, number> = {
    B: 1,
    K: 1024,
    M: 1024 ** 2,
    G: 1024 ** 3,
    T: 1024 ** 4,
    P: 1024 ** 5,
  }
  const match = size.match(/^([\d.]+)\s*([BKMGTP])?/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = (match[2] ?? 'B').toUpperCase()
  return Math.round(value * (units[unit] ?? 1))
}

function resolveOsHint(fstype: string | null): DiskPartition['osHint'] {
  if (!fstype) return 'unknown'
  const fs = fstype.toLowerCase()
  if (fs === 'ntfs' || fs === 'ntfs3' || fs === 'vfat' || fs === 'fat32') {
    return 'windows'
  }
  if (fs === 'ext4' || fs === 'ext3' || fs === 'ext2' || fs === 'btrfs' || fs === 'xfs') {
    return 'linux'
  }
  return 'unknown'
}

// ─── getDiskPartitions ────────────────────────────────────────────────────────

export async function getDiskPartitions(device: string): Promise<DiskPartition[]> {
  validateDevice(device)

  const result = await exec('lsblk', [
    '-J', '-b',
    '-o', 'NAME,SIZE,FSTYPE,PARTTYPENAME,TYPE',
    device,
  ])

  if (result.exitCode !== 0 || !result.stdout) return []

  let parsed: LsblkPartOutput
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    return []
  }

  const partitions: DiskPartition[] = []
  const root = parsed.blockdevices[0]
  if (!root) return []

  // If the disk itself has an fstype and no children (unpartitioned), return it
  if (!root.children || root.children.length === 0) {
    if (root.fstype) {
      partitions.push({
        partition: `/dev/${root.name}`,
        fsType: root.fstype,
        sizeBytes: parseSizeToBytes(root.size),
        osHint: resolveOsHint(root.fstype),
      })
    }
    return partitions
  }

  for (const child of root.children) {
    if (child.type !== 'part') continue
    partitions.push({
      partition: `/dev/${child.name}`,
      fsType: child.fstype ?? null,
      sizeBytes: parseSizeToBytes(child.size),
      osHint: resolveOsHint(child.fstype ?? null),
    })
  }

  return partitions
}

// ─── mountPartitionReadOnly ───────────────────────────────────────────────────

export async function mountPartitionReadOnly(
  device: string,
  browserId: string,
): Promise<{ mountPoint: string }> {
  return withFormatLock(async () => {
  validateDevice(device)
  validateBrowserId(browserId)

  const mountPoint = `/mnt/browse/${browserId}`

  // Create mount directory if needed
  try {
    mkdirSync(mountPoint, { recursive: true })
  } catch {
    // May fail if running without permissions; sudo mkdir will be attempted
  }

  const mkdirResult = await exec('mkdir', ['-p', mountPoint])
  if (mkdirResult.exitCode !== 0) {
    throw new Error(`Cannot create mount directory ${mountPoint}: ${mkdirResult.stderr}`)
  }

  // Detect filesystem type
  const blkResult = await exec('blkid', ['-o', 'value', '-s', 'TYPE', device])
  const fsType = blkResult.stdout.trim().toLowerCase()

  const isNtfs = fsType === 'ntfs' || fsType === 'ntfs3'

  let mountResult: { stdout: string; stderr: string; exitCode: number }

  if (isNtfs) {
    // Try ntfs3 (kernel driver, faster)
    mountResult = await exec('mount', [
      '-t', 'ntfs3',
      '-o', 'ro,uid=1000,nodev,nosuid,noexec',
      device,
      mountPoint,
    ])

    if (mountResult.exitCode !== 0) {
      // Fall back to ntfs-3g (FUSE)
      mountResult = await exec('mount', [
        '-t', 'ntfs-3g',
        '-o', 'ro,uid=1000,nodev,nosuid,noexec',
        device,
        mountPoint,
      ])
    }
  } else {
    const recovery = ['ext3', 'ext4'].includes(fsType) ? ',noload' : fsType === 'xfs' ? ',norecovery' : fsType === 'btrfs' ? ',nologreplay' : ''
    mountResult = await exec('mount', ['-o', `ro,nodev,nosuid,noexec${recovery}`, device, mountPoint])
  }

  if (mountResult.exitCode !== 0) {
    throw new Error(`Failed to mount ${device}: ${mountResult.stderr || mountResult.stdout}`)
  }

  return { mountPoint }
  })
}

// ─── unmountBrowse ────────────────────────────────────────────────────────────

export async function unmountBrowse(browserId: string): Promise<void> {
  validateBrowserId(browserId)

  const mountPoint = `/mnt/browse/${browserId}`
  const result = await exec('umount', [mountPoint])

  if (result.exitCode !== 0) {
    throw new Error(`Failed to unmount ${mountPoint}: ${result.stderr || result.stdout}`)
  }
}

// ─── addDiskToPool ────────────────────────────────────────────────────────────

async function findNextDiskN(count = 1): Promise<string> {
  const created = await exec('mkdir', ['-p', '/mnt/disks'])
  if (created.exitCode !== 0) throw new Error(`Cannot inspect disk mountpoints: ${created.stderr}`)
  const result = await exec('find', ['/mnt/disks', '-maxdepth', '1', '-mindepth', '1', '-type', 'd'])
  if (result.exitCode !== 0) throw new Error(`Cannot inspect disk mountpoints: ${result.stderr}`)
  const existing = result.exitCode === 0
    ? result.stdout.split('\n').map(s => s.trim()).filter(Boolean)
    : []

  let n = 1
  while (Array.from({ length: count }, (_, i) => `/mnt/disks/disk${n + i}`).some(p => existing.includes(p))) {
    n++
  }
  return `disk${n}`
}

async function findMergerFSMount(): Promise<{ mountPoint: string; sources: string[] } | null> {
  const mountsResult = await exec('cat', ['/proc/mounts'])
  if (mountsResult.exitCode !== 0) throw new Error('Cannot inspect MergerFS mounts')
  const poolLines = mountsResult.stdout.split('\n').filter(line => line.trim().split(/\s+/)[2] === 'fuse.mergerfs')
  if (poolLines.length > 1) throw new Error('Multiple MergerFS views exist; adding a disk cannot safely update every view. No disk has been formatted')

  for (const line of poolLines) {
    const parts = line.trim().split(/\s+/)
    if (parts[2] === 'fuse.mergerfs') {
      const mountPoint = parts[1]
      const branches = await exec('getfattr', ['--only-values', '-n', 'user.mergerfs.branches', `${mountPoint}/.mergerfs`])
      const sources = (branches.exitCode === 0 ? branches.stdout.trim() : parts[0]).split(':').filter(s => s.startsWith('/mnt/') && !/[\s\\]/.test(s))
      if (!sources.length) throw new Error('Cannot read existing MergerFS branches; refusing to format')
      return { mountPoint, sources }
    }
  }

  return null
}

async function setDiskPermissions(mountPoint: string): Promise<void> {
  for (const [command, args] of [['groupadd', ['-f', 'sambashare']], ['chown', ['homenas:sambashare', mountPoint]], ['chmod', ['2775', mountPoint]]] as [string, string[]][]) {
    const result = await exec(command, args)
    if (result.exitCode !== 0) throw new Error(`Cannot set disk permissions: ${result.stderr}`)
  }
}

export function mergeMountEntries(fstab: string, entries: Array<{ mountPoint: string; line: string }>): string {
  const mountpoints = new Set(entries.map(e => e.mountPoint))
  const existing = fstab.split('\n').filter(line => line.trim().startsWith('#') || !mountpoints.has(line.trim().split(/\s+/)[1]))
  return `${existing.join('\n').trimEnd()}\n${entries.map(e => e.line).join('\n')}\n`
}

async function persistMounts(assignments: Array<{ device: string; mountPoint: string }>, pool?: { mountPoint: string; sources: string[] }): Promise<void> {
  const fstab = readFileSync('/etc/fstab', 'utf8')
  const entries: Array<{ mountPoint: string; line: string }> = []
  for (const item of assignments) {
    const result = await exec('blkid', ['-s', 'UUID', '-o', 'value', item.device])
    const uuid = result.stdout.trim()
    if (result.exitCode !== 0 || !/^[a-fA-F0-9-]+$/.test(uuid)) throw new Error(`Cannot persist mount UUID for ${item.device}`)
    entries.push({ mountPoint: item.mountPoint, line: `UUID=${uuid} ${item.mountPoint} ext4 defaults,nofail 0 2 # homenas-v3` })
  }
  if (pool) entries.push({ mountPoint: pool.mountPoint, line: `${pool.sources.join(':')} ${pool.mountPoint} fuse.mergerfs defaults,use_ino,allow_other,func.getattr=newest,category.create=mfs,nofail 0 0 # homenas-v3` })
  await writeFileAsRoot('/etc/fstab', mergeMountEntries(fstab, entries))
}

export async function addDiskToPool(
  device: string,
): Promise<{ mountPoint: string; poolUpdated: boolean }> {
  const results = await bulkAddToPool([device])
  return { mountPoint: results[0].mountPoint, poolUpdated: results[0].poolUpdated }
}

export async function bulkAddToPool(
  devices: string[],
): Promise<Array<{ device: string; mountPoint: string; poolUpdated: boolean }>> {
  return withFormatLock(async () => {
  if (devices.length === 0) return []
  await assertSafeToFormat(devices)

  for (const device of devices) {
    validateDevice(device)
  }

  const mergerfs = await findMergerFSMount()
  if (!mergerfs) throw new Error('No MergerFS pool exists; create a pool first')

  // Assign disk names up-front (sequential, no race)
  const startN = await findNextDiskN(devices.length)
  const startIndex = parseInt(startN.replace('disk', ''), 10)

  const assignments = devices.map((device, i) => ({
    device,
    diskName: `disk${startIndex + i}`,
    mountPoint: `/mnt/disks/disk${startIndex + i}`,
  }))

  // Sequential formatting keeps the mutation lock until every command stops.
  for (const { device, diskName, mountPoint } of assignments) {
      const mkdirResult = await exec('mkdir', ['-p', mountPoint])
      if (mkdirResult.exitCode !== 0) {
        throw new Error(`Cannot create ${mountPoint}: ${mkdirResult.stderr}`)
      }

      const formatResult = await exec('mkfs.ext4', ['-F', '-L', diskName, device])
      if (formatResult.exitCode !== 0) {
        throw new Error(`mkfs.ext4 failed on ${device}: ${formatResult.stderr || formatResult.stdout}`)
      }

      const mountResult = await exec('mount', [device, mountPoint])
      if (mountResult.exitCode !== 0) {
        throw new Error(`Failed to mount ${device} at ${mountPoint}: ${mountResult.stderr}`)
      }
      await persistMounts([{ device, mountPoint }])
      await setDiskPermissions(mountPoint)
  }

  // Add all new mount points to the MergerFS pool in one remount
  let poolUpdated = false

  if (mergerfs) {
    const newMounts = assignments.map(a => a.mountPoint)
    const updatedSources = [...mergerfs.sources, ...newMounts].join(':')

    const remountResult = await exec('setfattr', [
      '-n', 'user.mergerfs.branches', '-v', updatedSources, `${mergerfs.mountPoint}/.mergerfs`,
    ])
    if (remountResult.exitCode !== 0) {
      await persistMounts(assignments)
      throw new Error(`New disks mounted but pool update failed: ${remountResult.stderr}`)
    }
    await persistMounts(assignments, { mountPoint: mergerfs.mountPoint, sources: updatedSources.split(':') })

    poolUpdated = remountResult.exitCode === 0
  }

  return assignments.map(a => ({ device: a.device, mountPoint: a.mountPoint, poolUpdated }))
  })
}

// ─── createPool ───────────────────────────────────────────────────────────────

async function findAvailablePoolMount(): Promise<string> {
  const base = '/mnt/pool'
  const checkResult = await exec('mountpoint', ['-q', base])
  if (checkResult.exitCode !== 0) return base

  let n = 2
  while (true) {
    const candidate = `${base}${n}`
    const check = await exec('mountpoint', ['-q', candidate])
    if (check.exitCode !== 0) return candidate
    n++
  }
}

export async function createPool(
  devices: string[],
): Promise<{ poolMount: string; drives: string[] }> {
  return withFormatLock(async () => {
  if (devices.length === 0) throw new Error('At least one device is required')
  await assertSafeToFormat(devices)
  const startIndex = parseInt((await findNextDiskN(devices.length)).replace('disk', ''), 10)

  for (const device of devices) {
    validateDevice(device)
  }

  const drives: string[] = []
  for (const [i, device] of devices.entries()) {
      const diskName = `disk${startIndex + i}`
      const mountPoint = `/mnt/disks/${diskName}`

      const mkdirResult = await exec('mkdir', ['-p', mountPoint])
      if (mkdirResult.exitCode !== 0) {
        throw new Error(`Cannot create ${mountPoint}: ${mkdirResult.stderr}`)
      }

      const formatResult = await exec('mkfs.ext4', ['-F', '-L', diskName, device])
      if (formatResult.exitCode !== 0) {
        throw new Error(`mkfs.ext4 failed on ${device}: ${formatResult.stderr || formatResult.stdout}`)
      }

      const mountResult = await exec('mount', [device, mountPoint])
      if (mountResult.exitCode !== 0) {
        throw new Error(`Failed to mount ${device} at ${mountPoint}: ${mountResult.stderr}`)
      }

      await persistMounts([{ device, mountPoint }])
      await setDiskPermissions(mountPoint)
      drives.push(mountPoint)
  }

  const poolMount = await findAvailablePoolMount()

  // Create pool mount directory
  const mkdirPool = await exec('mkdir', ['-p', poolMount])
  if (mkdirPool.exitCode !== 0) {
    throw new Error(`Cannot create pool directory ${poolMount}: ${mkdirPool.stderr}`)
  }

  // Mount MergerFS
  const sources = drives.join(':')
  const mergeResult = await exec('mount', [
    '-t', 'fuse.mergerfs',
    '-o', 'use_ino,allow_other,func.getattr=newest,category.create=mfs',
    sources,
    poolMount,
  ])

  if (mergeResult.exitCode !== 0) {
    throw new Error(`Failed to create MergerFS pool: ${mergeResult.stderr || mergeResult.stdout}`)
  }

  await persistMounts(devices.map((device, i) => ({ device, mountPoint: drives[i] })), { mountPoint: poolMount, sources: drives })
  return { poolMount, drives }
  })
}

// Re-export type for use in routes
export type { DiskPartition }
