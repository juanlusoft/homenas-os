import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { execa } from 'execa'
import { exec, sudoWrap } from '../lib/exec.js'

export type DiskRole = 'data' | 'parity' | 'cache'
export type PoolType = 'single' | 'mergerfs' | 'snapraid'
export type FsType = 'ext4' | 'xfs'

export interface DiskConfig {
  device: string   // e.g. /dev/sda
  role: DiskRole
}

export interface PoolConfig {
  disks: DiskConfig[]
  fsType: FsType
  poolType: PoolType
}

// ── Input validation ──────────────────────────────────────────────────────────

const DEVICE_RE = /^\/dev\/(sd[a-z]+|hd[a-z]+|nvme\d+n\d+|mmcblk\d+|vd[a-z]+)$/

function validateDevice(device: string): void {
  if (!DEVICE_RE.test(device)) throw new Error(`Invalid device path: ${device}`)
}

// Get the block device that contains the root filesystem
async function getSystemDisk(): Promise<string> {
  const r = await exec('findmnt', ['-n', '-o', 'SOURCE', '/'])
  if (r.exitCode !== 0 || !r.stdout.trim()) {
    // fallback: df
    const df = await exec('df', ['/'])
    const src = df.stdout.trim().split('\n')[1]?.split(/\s+/)[0] ?? ''
    // strip partition suffix: /dev/sda1 → /dev/sda, /dev/mmcblk0p1 → /dev/mmcblk0
    return src.replace(/p?\d+$/, '')
  }
  return r.stdout.trim().replace(/p?\d+$/, '')
}

// Partition suffix: /dev/sda → /dev/sda1, /dev/nvme0n1 → /dev/nvme0n1p1
function partitionDevice(device: string): string {
  if (/nvme|mmcblk/.test(device)) return device + 'p1'
  return device + '1'
}

// ── Prepare disk (unmount + wipe) ─────────────────────────────────────────────

async function prepDisk(device: string): Promise<void> {
  // 1. Unmount all partitions of this device (lazy -l ensures it always succeeds)
  try {
    const mounts = readFileSync('/proc/mounts', 'utf8')
    for (const line of mounts.split('\n')) {
      const src = line.trim().split(/\s+/)[0] ?? ''
      if (src.startsWith(device)) {
        await execa(...sudoWrap('umount', ['-l', src]), { shell: false, reject: false })
      }
    }
  } catch { /* /proc/mounts unreadable — skip */ }

  // 2. Deactivate any LVM volume groups that reference this device
  await execa(...sudoWrap('vgchange', ['-an']), { shell: false, reject: false })

  // 3. Wipe all filesystem/partition-table signatures
  await execa(...sudoWrap('wipefs', ['-a', '-f', device]), { shell: false, reject: false })

  // 4. Zero the first 10 MB to clear MBR/GPT and any leftover metadata
  await execa(...sudoWrap('dd', [
    'if=/dev/zero', `of=${device}`, 'bs=1M', 'count=10', 'conv=fsync',
  ]), { shell: false, reject: false })

  // 5. Let the kernel re-read the (now empty) partition table
  await execa(...sudoWrap('partprobe', [device]), { shell: false, reject: false })
  await new Promise<void>(r => setTimeout(r, 1000))
}

// ── Format a single disk ──────────────────────────────────────────────────────

async function formatDisk(device: string, fsType: FsType, role: DiskRole): Promise<void> {
  // Unmount and wipe any existing data before touching the partition table
  await prepDisk(device)

  // Create GPT partition table
  const labelResult = await execa(...sudoWrap('parted', ['-s', device, 'mklabel', 'gpt']), { shell: false, reject: false })
  if (labelResult.exitCode !== 0) {
    throw new Error(`Failed to create GPT on ${device}: ${labelResult.stderr}`)
  }

  // Create single partition
  const mkPartResult = await execa(...sudoWrap('parted', ['-s', device, 'mkpart', 'primary', fsType, '0%', '100%']), { shell: false, reject: false })
  if (mkPartResult.exitCode !== 0) {
    throw new Error(`Failed to create partition on ${device}: ${mkPartResult.stderr}`)
  }

  // Re-read partition table and wait for udev to create the partition device node
  await execa(...sudoWrap('partprobe', [device]), { shell: false, reject: false })
  await execa(...sudoWrap('udevadm', ['settle', '--timeout=10']), { shell: false, reject: false })

  const partition = partitionDevice(device)
  const label = `${role}_${device.replace('/dev/', '')}`.substring(0, 16)

  // Wait up to 10 s for the partition node to appear (udevadm settle not always enough)
  const deadline = Date.now() + 10_000
  while (!await execa(...sudoWrap('test', ['-b', partition]), { shell: false, reject: false }).then(r => r.exitCode === 0)) {
    if (Date.now() > deadline) throw new Error(`Partition device ${partition} did not appear after 10s`)
    await new Promise<void>(r => setTimeout(r, 500))
  }

  // Format — use absolute paths because the service may not have /sbin in PATH
  let fmtResult
  if (fsType === 'xfs') {
    fmtResult = await execa(...sudoWrap('/sbin/mkfs.xfs', ['-f', '-L', label, partition]), { shell: false, reject: false })
  } else {
    fmtResult = await execa(...sudoWrap('/sbin/mkfs.ext4', ['-F', '-L', label, partition]), { shell: false, reject: false })
  }

  if (fmtResult.exitCode !== 0) {
    throw new Error(`Failed to format ${partition}: ${fmtResult.stderr || fmtResult.stdout}`)
  }
}

// ── SnapRAID configuration ────────────────────────────────────────────────────

function writeSnapraidConf(dataMounts: string[], parityMounts: string[]): void {
  const SECOND_PARITY = ['second', 'third', 'fourth', 'fifth', 'sixth']

  let conf = '# SnapRAID configuration — generated by HomeNas OS v3\n\n'

  parityMounts.forEach((m, i) => {
    const label = i === 0 ? 'parity' : `${SECOND_PARITY[i - 1] ?? i + 1 + 'th'}-parity`
    conf += `${label} ${m}/snapraid.parity\n`
  })
  conf += '\n'

  dataMounts.forEach(m => { conf += `content ${m}/.snapraid/snapraid.content\n` })
  if (parityMounts.length) conf += `content ${parityMounts[0]}/.snapraid/snapraid.content\n`
  conf += '\n'

  dataMounts.forEach((m, i) => { conf += `disk d${i + 1} ${m}\n` })
  conf += '\n'

  conf += 'exclude *.unrecoverable\nexclude /tmp/\nexclude /lost+found/\nexclude /.snapraid/\n'

  writeFileSync('/etc/snapraid.conf', conf, 'utf8')
}

// ── MergerFS pool ─────────────────────────────────────────────────────────────

async function mountMergerFS(cacheMounts: string[], dataMounts: string[]): Promise<void> {
  const POOL = '/mnt/storage'
  mkdirSync(POOL, { recursive: true })

  // Cache disks FIRST so the ff (first found) policy always writes there.
  // Data disks follow as overflow once the cache is full.
  const sources = [...cacheMounts, ...dataMounts].join(':')

  // func.create=ff: new files go to the first branch with enough space (cache).
  // moveonenospc: if cache fills up, spill to next branch automatically.
  const r = await execa(
    ...sudoWrap('mergerfs', [sources, POOL, '-o', 'defaults,allow_other,use_ino,func.create=ff,moveonenospc=true,minfreespace=4G,fsname=mergerfs']),
    { shell: false, reject: false }
  )
  if (r.exitCode !== 0) {
    console.warn('[setup-pool] mergerfs not available or failed:', r.stderr)
  }
}

// ── fstab persistence ─────────────────────────────────────────────────────────

async function updateFstab(
  mounts: { partition: string; mountPoint: string; role: DiskRole }[],
  poolType: PoolType,
  dataCacheMounts: string[],
): Promise<void> {
  let content = ''
  try { content = readFileSync('/etc/fstab', 'utf8') } catch { content = '' }

  // Remove previous homenas entries
  content = content
    .split('\n')
    .filter(l => !l.includes('# homenas-v3'))
    .join('\n')
    .trimEnd()

  let additions = '\n\n# HomeNas OS v3 managed entries\n'

  for (const { partition, mountPoint } of mounts) {
    const blkid = await exec('blkid', ['-s', 'UUID', '-o', 'value', partition])
    const uuid = blkid.stdout.trim()
    if (uuid) {
      additions += `UUID=${uuid} ${mountPoint} auto defaults,nofail 0 2 # homenas-v3\n`
    }
  }

  if ((poolType === 'mergerfs' || poolType === 'snapraid') && dataCacheMounts.length) {
    // Cache first, then data — matches the ff create policy (first found = cache)
    const sources = dataCacheMounts.join(':')
    additions += `${sources} /mnt/storage fuse.mergerfs defaults,allow_other,use_ino,func.create=ff,moveonenospc=true,minfreespace=4G,fsname=mergerfs,nofail 0 0 # homenas-v3\n`
  }

  writeFileSync('/etc/fstab', content + additions, 'utf8')
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function configurePool(config: PoolConfig): Promise<void> {
  const { disks, fsType, poolType } = config

  if (disks.length === 0) throw new Error('No disks selected')

  for (const d of disks) validateDevice(d.device)

  // Guard: do not format the system disk
  const sysDisk = await getSystemDisk()
  for (const d of disks) {
    if (d.device === sysDisk) throw new Error(`Cannot format system disk ${d.device}`)
  }

  const dataDisks   = disks.filter(d => d.role === 'data')
  const parityDisks = disks.filter(d => d.role === 'parity')
  const cacheDisks  = disks.filter(d => d.role === 'cache')

  if (dataDisks.length === 0) throw new Error('At least one data disk required')
  if (poolType === 'snapraid' && parityDisks.length === 0) {
    throw new Error('SnapRAID requires at least one parity disk')
  }

  // 1. Format all disks
  await Promise.all(disks.map(d => formatDisk(d.device, fsType, d.role)))

  // 2. Create mount points and mount
  const mountEntries: { partition: string; mountPoint: string; role: DiskRole }[] = []
  let di = 1, pi = 1, ci = 1

  for (const d of disks) {
    const mp = d.role === 'data'   ? `/mnt/disks/disk${di++}`
             : d.role === 'parity' ? `/mnt/parity${pi++}`
             :                       `/mnt/disks/cache${ci++}`

    mkdirSync(mp, { recursive: true })

    if (d.role === 'data') mkdirSync(`${mp}/.snapraid`, { recursive: true })

    const partition = partitionDevice(d.device)
    const mountResult = await execa(...sudoWrap('mount', [partition, mp]), { shell: false, reject: false })
    if (mountResult.exitCode !== 0) throw new Error(`Failed to mount ${partition} at ${mp}: ${mountResult.stderr}`)

    mountEntries.push({ partition, mountPoint: mp, role: d.role })
  }

  const dataMounts   = mountEntries.filter(m => m.role === 'data').map(m => m.mountPoint)
  const parityMounts = mountEntries.filter(m => m.role === 'parity').map(m => m.mountPoint)
  const cacheMounts  = mountEntries.filter(m => m.role === 'cache').map(m => m.mountPoint)

  // fstab entry: cache first, then data (matches ff create policy)
  const cacheDataOrdered = [...cacheMounts, ...dataMounts]

  // 3. SnapRAID config (only data + parity, cache is not part of SnapRAID)
  if (poolType === 'snapraid') writeSnapraidConf(dataMounts, parityMounts)

  // 4. MergerFS pool — cache first so writes land there, drain cron moves to data
  if (poolType === 'mergerfs' || poolType === 'snapraid') {
    await mountMergerFS(cacheMounts.length ? cacheMounts : dataMounts, cacheMounts.length ? dataMounts : [])
  }

  // 5. Persist in fstab
  await updateFstab(mountEntries, poolType, cacheDataOrdered)
}
