import { exec } from '../lib/exec.js'

export interface BlockDevice {
  path: string
  type: string
  size?: number | string
  'maj:min': string
  mountpoints?: Array<string | null>
  children?: BlockDevice[]
}

/** Refuse destructive operations unless topology and root ownership are known. */
export function validateFormatTargets(devices: string[], tree: BlockDevice[], rootId: string): void {
  if (new Set(devices).size !== devices.length) throw new Error('Duplicate devices selected')
  const nodes = new Map<string, BlockDevice>()
  const protectedPaths = new Set<string>()
  let rootFound = false
  const visit = (node: BlockDevice, parents: string[]) => {
    nodes.set(node.path, node)
    if (node['maj:min'] === rootId) {
      if (node.type !== 'disk' && parents.length === 0) throw new Error('Incomplete block topology; cannot identify physical system disk')
      rootFound = true
      for (const path of [...parents, node.path]) protectedPaths.add(path)
    }
    for (const child of node.children ?? []) visit(child, [...parents, node.path])
  }
  for (const node of tree) visit(node, [])
  if (!rootFound) throw new Error('Cannot identify the physical system disk; refusing to format')
  const descendants = (node: BlockDevice): BlockDevice[] => [node, ...(node.children ?? []).flatMap(descendants)]
  for (const device of devices) {
    const node = nodes.get(device)
    if (!node || !['disk', 'part'].includes(node.type)) throw new Error(`Unknown or unsupported block device: ${device}`)
    if (node.size !== undefined && (!Number.isFinite(Number(node.size)) || Number(node.size) <= 0)) throw new Error(`Device ${device} has no usable capacity`)
    const affected = descendants(node)
    if (affected.some(n => protectedPaths.has(n.path))) throw new Error(`Cannot format system disk ${device}`)
    if (affected.some(n => n.mountpoints?.some(Boolean))) throw new Error(`Device ${device} or a descendant is mounted or in use as swap`)
    if (affected.some(n => !['disk', 'part'].includes(n.type))) throw new Error(`Device ${device} has active RAID/LVM holders`)
    if (affected.some(n => n.path !== device && devices.includes(n.path))) throw new Error('Overlapping devices selected')
  }
}

export async function assertSafeToFormat(devices: string[]): Promise<void> {
  const root = await exec('findmnt', ['-n', '-o', 'MAJ:MIN', '/'])
  const blocks = await exec('lsblk', ['--json', '--tree', '--paths', '--bytes', '-o', 'PATH,TYPE,SIZE,MAJ:MIN,MOUNTPOINTS'])
  if (root.exitCode !== 0 || !root.stdout.trim() || blocks.exitCode !== 0) throw new Error('Cannot inspect system disks; refusing to format')
  const tree = JSON.parse(blocks.stdout) as { blockdevices: BlockDevice[] }
  if (!Array.isArray(tree.blockdevices)) throw new Error('Invalid block topology; refusing to format')
  validateFormatTargets(devices, tree.blockdevices, root.stdout.trim())
}

let formatting = false
export function acquireStorageMutation(): () => void {
  if (formatting) throw new Error('Another disk formatting operation is running')
  formatting = true
  return () => { formatting = false }
}
export async function withFormatLock<T>(operation: () => Promise<T>): Promise<T> {
  const release = acquireStorageMutation()
  try { return await operation() } finally { release() }
}

export function selectPrimaryMergerfsMount(mountpoints: string[], storageAlias: string | null): string | null {
  if (!mountpoints.length) return null
  if (storageAlias && mountpoints.includes(storageAlias)) return storageAlias
  if (mountpoints.length === 1) return mountpoints[0]
  throw new Error('Multiple MergerFS pools found without a matching /mnt/storage alias; pool selection is ambiguous')
}

export async function primaryMergerfsMount(mountpoints: string[], storagePath = '/mnt/storage'): Promise<string | null> {
  const { realpath } = await import('node:fs/promises')
  let alias: string | null = null
  try { alias = await realpath(storagePath) } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
  }
  const canonical = await Promise.all(mountpoints.map(async mountpoint => {
    try { return await realpath(mountpoint) } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      return mountpoint
    }
  }))
  const selected = selectPrimaryMergerfsMount(canonical, alias)
  return selected === null ? null : mountpoints[canonical.indexOf(selected)]
}
