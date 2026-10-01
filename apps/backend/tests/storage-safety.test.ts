import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateFormatTargets, withFormatLock, type BlockDevice } from '../src/services/storage-safety.js'
import { validateExtraArgs } from '../src/services/backup.service.js'

const root: BlockDevice = { path: '/dev/nvme0n1', type: 'disk', 'maj:min': '259:0', children: [{ path: '/dev/nvme0n1p2', type: 'part', 'maj:min': '259:2', mountpoints: ['/'] }] }
const data: BlockDevice = { path: '/dev/sdb', type: 'disk', 'maj:min': '8:16', mountpoints: [null] }
test('format guard resolves NVMe root without truncating namespace', () => {
  assert.throws(() => validateFormatTargets(['/dev/nvme0n1'], [root, data], '259:2'), /system disk/)
  assert.throws(() => validateFormatTargets(['/dev/nvme0n1p2'], [root, data], '259:2'), /system disk/)
  assert.doesNotThrow(() => validateFormatTargets(['/dev/sdb'], [root, data], '259:2'))
})
test('format guard refuses unknown topology, duplicates, mounted children and LVM', () => {
  assert.throws(() => validateFormatTargets(['/dev/sdb'], [root, data], '0:1'), /Cannot identify/)
  assert.throws(() => validateFormatTargets(['/dev/sdb', '/dev/sdb'], [root, data], '259:2'), /Duplicate/)
  const part = { path: '/dev/sdb1', type: 'part', 'maj:min': '8:17', mountpoints: ['/mnt/data'] }
  assert.throws(() => validateFormatTargets(['/dev/sdb'], [root, { ...data, children: [part] }], '259:2'), /mounted/)
  assert.throws(() => validateFormatTargets(['/dev/sdb'], [root, { ...data, children: [{ ...part, type: 'lvm', mountpoints: [] }] }], '259:2'), /holders/)
  assert.throws(() => validateFormatTargets(['/dev/sdb'], [root, { ...data, mountpoints: ['[SWAP]'] }], '259:2'), /swap/)
  assert.throws(() => validateFormatTargets(['/dev/sdb', '/dev/sdb1'], [root, { ...data, children: [{ ...part, mountpoints: [] }] }], '259:2'), /Overlapping/)
})
test('format guard protects every physical ancestor of LVM/RAID root', () => {
  const mapper = { path: '/dev/mapper/root', type: 'lvm', 'maj:min': '253:0', mountpoints: ['/'] }
  assert.throws(() => validateFormatTargets(['/dev/sdb'], [{ ...data, children: [mapper] }], '253:0'), /system disk/)
})
test('format lock excludes concurrent entrypoints and releases after failures', async () => {
  let release!: () => void
  const running = withFormatLock(() => new Promise<void>(resolve => { release = resolve }))
  await assert.rejects(withFormatLock(async () => {}), /Another/)
  release(); await running
  await assert.rejects(withFormatLock(async () => { throw new Error('failure') }), /failure/)
  await withFormatLock(async () => {})
})
test('backup rejects attached and bundled shell execution flags', () => {
  for (const arg of ['-esh -c id', '-avzeevil', '--rsh=sh', '--rsync-path=sh', '--rsync-p=sh']) assert.throws(() => validateExtraArgs('rsync', [arg]))
  for (const arg of ['-Ish', '-czIsh', '--checkpoint-action=exec=id', '--checkpoint-a=exec=id', '--rmt-command=id']) assert.throws(() => validateExtraArgs('tar', [arg]))
  assert.throws(() => validateExtraArgs('rclone', ['--password-command=id']))
  assert.doesNotThrow(() => validateExtraArgs('rsync', ['-avz', '--exclude=tmp']))
})

import { parseProcStat, parseNetDev } from '../src/services/system.service.js'
test('metrics avoid counting virtual guest CPU twice and parse attached RX counter', () => {
  assert.deepEqual(parseProcStat('cpu 100 20 30 40 5 6 7 8 50 10\n'), { idle: 45, total: 216 })
  assert.deepEqual(parseNetDev('eth0:123 2 3 4 5 6 7 8 456 10 11 12 13 14 15 16\n', 'eth0'), { rxBytes: 123, txBytes: 456 })
})

import { mergeMountEntries } from '../src/services/disk-manage.service.js'
test('disk persistence replaces only matching mountpoints and preserves unrelated entries', () => {
  const previous = '# root disk\nUUID=root / ext4 defaults 0 1\nUUID=old /mnt/disks/disk1 ext4 defaults 0 2\n/mnt/disks/disk1 /mnt/storage fuse.mergerfs defaults 0 0\n'
  const result = mergeMountEntries(previous, [{ mountPoint: '/mnt/storage', line: '/mnt/disks/disk1:/mnt/disks/disk2 /mnt/storage fuse.mergerfs defaults 0 0' }])
  assert.ok(result.includes('UUID=root / ext4'))
  assert.ok(result.includes('UUID=old /mnt/disks/disk1'))
  assert.equal(result.split('\n').filter(l => l.includes(' /mnt/storage ')).length, 1)
  assert.ok(result.includes('/mnt/disks/disk1:/mnt/disks/disk2'))
})

import { validateRemoteConfig } from '../src/services/cloud-backup.service.js'
test('cloud remote config rejects INI directive injection and executable password commands', () => {
  for (const config of [{ pass: 'password\n[other]\ntype = local' }, { 'type\n[other]': 'local' }, { type: 'local' }, { password_command: 'id' }, { port: 22 }]) assert.throws(() => validateRemoteConfig(config as Record<string, string>))
  assert.doesNotThrow(() => validateRemoteConfig({ host: 'nas.local', pass: 'secret', user: 'backup' }))
})

import { findProjectRoot } from '../src/lib/project-root.js'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
test('project-root discovery supports source and compiled backend nesting', () => {
  const root = findProjectRoot(import.meta.url)
  assert.equal(findProjectRoot(pathToFileURL(join(root, 'apps/backend/src/services/updates.service.ts')).href), root)
  assert.equal(findProjectRoot(pathToFileURL(join(root, 'apps/backend/dist/src/services/updates.service.js')).href), root)
  assert.equal(findProjectRoot(pathToFileURL(join(root, 'apps/backend/dist/src/routes/storage/index.js')).href), root)
})

test('flat lsblk topology is refused and disconnected disks are never formatted', () => {
  assert.throws(() => validateFormatTargets(['/dev/nvme0n1'], [{ ...root, children: [] }, ...root.children!, data], '259:2'), /Incomplete block topology/)
  assert.throws(() => validateFormatTargets(['/dev/sdb'], [root, { ...data, size: 0 }], '259:2'), /no usable capacity/)
})

import { selectPrimaryMergerfsMount } from '../src/services/storage-safety.js'
test('multi-view pools select storage alias instead of first archive; ambiguity fails closed', () => {
  const mounts = ['/mnt/pool-archive', '/mnt/pool-write', '/mnt/pool']
  assert.equal(selectPrimaryMergerfsMount(mounts, '/mnt/pool'), '/mnt/pool')
  assert.equal(selectPrimaryMergerfsMount(['/mnt/pool-archive'], null), '/mnt/pool-archive')
  assert.equal(selectPrimaryMergerfsMount([], null), null)
  assert.throws(() => selectPrimaryMergerfsMount(mounts, null), /ambiguous/)
  assert.throws(() => selectPrimaryMergerfsMount(mounts, '/mnt/unrelated'), /ambiguous/)
})

import { primaryMergerfsMount } from '../src/services/storage-safety.js'
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
test('primary pool resolver follows a real storage symlink with temporary mounts', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'homenas-pool-alias-'))
  try {
    const archive = join(temporary, 'pool-archive')
    const primary = join(temporary, 'pool')
    const alias = join(temporary, 'storage')
    await mkdir(archive); await mkdir(primary); await symlink(primary, alias)
    assert.equal(await primaryMergerfsMount([archive, primary], alias), primary)
    await assert.rejects(primaryMergerfsMount([archive, primary], join(temporary, 'absent')), /ambiguous/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
