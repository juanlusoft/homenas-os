import { mkdirSync, readFileSync } from 'node:fs'
import { exec } from '../lib/exec.js'
import type { DiskPartition } from '@homenas/shared'

// ─── Security ─────────────────────────────────────────────────────────────────

const DEVICE_RE = /^\/dev\/[a-z]{1,3}[0-9]{0,2}[a-z0-9]*$/
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
      '-o', 'ro,uid=1000',
      device,
      mountPoint,
    ])

    if (mountResult.exitCode !== 0) {
      // Fall back to ntfs-3g (FUSE)
      mountResult = await exec('mount', [
        '-t', 'ntfs-3g',
        '-o', 'ro,uid=1000',
        device,
        mountPoint,
      ])
    }
  } else {
    mountResult = await exec('mount', ['-o', 'ro', device, mountPoint])
  }

  if (mountResult.exitCode !== 0) {
    throw new Error(`Failed to mount ${device}: ${mountResult.stderr || mountResult.stdout}`)
  }

  return { mountPoint }
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

async function findNextDiskN(): Promise<string> {
  const result = await exec('find', ['/mnt/disks', '-maxdepth', '1', '-mindepth', '1', '-type', 'd'])
  const existing = result.exitCode === 0
    ? result.stdout.split('\n').map(s => s.trim()).filter(Boolean)
    : []

  let n = 1
  while (existing.some(p => p === `/mnt/disks/disk${n}`)) {
    n++
  }
  return `disk${n}`
}

async function findMergerFSMount(): Promise<{ mountPoint: string; sources: string[] } | null> {
  const mountsResult = await exec('cat', ['/proc/mounts'])
  if (mountsResult.exitCode !== 0) return null

  for (const line of mountsResult.stdout.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts[2] === 'fuse.mergerfs') {
      const mountPoint = parts[1]
      const sources = parts[0].split(':').filter(s => s.startsWith('/'))
      return { mountPoint, sources }
    }
  }

  return null
}

export async function addDiskToPool(
  device: string,
): Promise<{ mountPoint: string; poolUpdated: boolean }> {
  validateDevice(device)

  const diskName = await findNextDiskN()
  const mountPoint = `/mnt/disks/${diskName}`

  // Create mount dir
  const mkdirResult = await exec('mkdir', ['-p', mountPoint])
  if (mkdirResult.exitCode !== 0) {
    throw new Error(`Cannot create ${mountPoint}: ${mkdirResult.stderr}`)
  }

  // Format as ext4
  const formatResult = await exec('mkfs.ext4', ['-F', '-L', diskName, device])
  if (formatResult.exitCode !== 0) {
    throw new Error(`mkfs.ext4 failed on ${device}: ${formatResult.stderr || formatResult.stdout}`)
  }

  // Mount the new disk
  const mountResult = await exec('mount', [device, mountPoint])
  if (mountResult.exitCode !== 0) {
    throw new Error(`Failed to mount ${device} at ${mountPoint}: ${mountResult.stderr}`)
  }

  // Try to add to existing MergerFS pool
  const mergerfs = await findMergerFSMount()
  if (!mergerfs) {
    return { mountPoint, poolUpdated: false }
  }

  // Build updated sources list: existing + new path
  const updatedSources = [...mergerfs.sources, mountPoint].join(':')

  const remountResult = await exec('mount', [
    '-o', `remount,use_ino,allow_other,func.getattr=newest,category.create=mfs,${updatedSources}`,
    mergerfs.mountPoint,
  ])

  if (remountResult.exitCode !== 0) {
    // Remount may need different syntax depending on MergerFS version.
    // Try alternative: mount the sources directly.
    const remountAlt = await exec('mount', [
      '-o', `remount`,
      mergerfs.mountPoint,
    ])
    if (remountAlt.exitCode !== 0) {
      // Pool mount failed but disk is mounted — partial success
      return { mountPoint, poolUpdated: false }
    }
  }

  return { mountPoint, poolUpdated: true }
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
  if (devices.length === 0) throw new Error('At least one device is required')

  for (const device of devices) {
    validateDevice(device)
  }

  const drives: string[] = []

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i]
    const diskName = `disk${i + 1}`
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

  return { poolMount, drives }
}

// Re-export type for use in routes
export type { DiskPartition }
