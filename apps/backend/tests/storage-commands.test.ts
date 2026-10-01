import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, symlink, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { configurePool } from '../src/services/setup-pool.service.js'
import { createPool, bulkAddToPool } from '../src/services/disk-manage.service.js'
import { startBadblocks, getBadblocksStatus } from '../src/services/storage.service.js'

// Every command that can mutate system state resolves to this fake executable.
// Never run setup's absolute formatter: only rejection paths of configurePool.
test('format entrypoints refuse root before destructive commands; add/create mount only mocked disks and persist UUID', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'homenas-command-mocks-'))
  const oldPath = process.env.PATH
  const oldLog = process.env.STORAGE_TEST_LOG
  process.env.PATH = tmp
  process.env.STORAGE_TEST_LOG = join(tmp, 'calls.jsonl')
  const mock = join(tmp, 'mock')
  await writeFile(mock, `#!/usr/bin/python3
import os,sys,json
command=os.path.basename(sys.argv[0]); args=sys.argv[1:]
if command=='sudo': os.execvp(args[0], args)
with open(os.environ['STORAGE_TEST_LOG'],'a') as f: f.write(json.dumps([command,args])+'\\n')
if command=='findmnt': print('259:2')
elif command=='lsblk' and ('--tree' not in args or '--bytes' not in args): sys.exit(98)
elif command=='lsblk': print(json.dumps({'blockdevices':[{'path':'/dev/nvme0n1','type':'disk','maj:min':'259:0','children':[{'path':'/dev/nvme0n1p2','type':'part','maj:min':'259:2','mountpoints':['/']}]},{'path':'/dev/sdb','type':'disk','maj:min':'8:16','mountpoints':[None]},{'path':'/dev/sdc','type':'disk','maj:min':'8:32','mountpoints':[None]}]}))
elif command=='find': print('/mnt/disks/disk1\\n/mnt/disks/disk3')
elif command=='cat':
 print('/mnt/disks/disk1 /mnt/storage fuse.mergerfs rw 0 0')
 if os.environ.get('STORAGE_TEST_MULTI')=='1': print('/mnt/disks/disk1 /mnt/pool-archive fuse.mergerfs rw 0 0')
elif command=='getfattr': print('/mnt/disks/disk1=RO')
elif command=='blkid': print('abcd-1234-'+('b' if args[-1].endswith('b') else 'c'))
elif command=='mountpoint': sys.exit(32)
elif command=='install':
 with open(args[-2]) as source, open(os.environ['STORAGE_TEST_LOG'],'a') as f: f.write(json.dumps(['fstab',source.read()])+'\\n')
elif command not in ['mkdir','mkfs.ext4','mount','setfattr','groupadd','chown','chmod','stdbuf']: sys.exit(99)
`, { mode: 0o700 })
  for (const cmd of ['sudo', 'findmnt', 'lsblk', 'find', 'cat', 'getfattr', 'blkid', 'mountpoint', 'install', 'mkdir', 'mkfs.ext4', 'mount', 'setfattr', 'groupadd', 'chown', 'chmod', 'stdbuf']) await symlink(mock, join(tmp, cmd))
  try {
    await assert.rejects(configurePool({ disks: [{ device: '/dev/nvme0n1', role: 'data' }], fsType: 'ext4', poolType: 'single' }), /system disk/)
    await assert.rejects(createPool(['/dev/nvme0n1']), /system disk/)
    await assert.rejects(bulkAddToPool(['/dev/nvme0n1']), /system disk/)
    await assert.rejects(startBadblocks('/dev/nvme0n1', true), /system disk/)
    const rejected = (await readFile(process.env.STORAGE_TEST_LOG, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line))
    assert.ok(rejected.every(([cmd]) => ['findmnt', 'lsblk'].includes(cmd)), 'no formatting/mount commands before root guard')
    process.env.STORAGE_TEST_MULTI = '1'
    await assert.rejects(bulkAddToPool(['/dev/sdb', '/dev/sdc']), /Multiple MergerFS views/)
    const ambiguous = (await readFile(process.env.STORAGE_TEST_LOG, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line))
    assert.ok(!ambiguous.some(([command]) => command === 'mkfs.ext4'), 'ambiguous multi-view add must refuse before format')
    delete process.env.STORAGE_TEST_MULTI
    const result = await bulkAddToPool(['/dev/sdb', '/dev/sdc'])
    assert.deepEqual(result.map(d => d.mountPoint), ['/mnt/disks/disk4', '/mnt/disks/disk5'])
    const calls = (await readFile(process.env.STORAGE_TEST_LOG, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line))
    const branchChange = calls.find(([cmd]) => cmd === 'setfattr')
    assert.ok(branchChange[1].includes('/mnt/disks/disk1=RO:/mnt/disks/disk4:/mnt/disks/disk5'), 'preserves existing RO branch policy')
    const fstab = calls.filter(([cmd]) => cmd === 'fstab').at(-1)[1]
    assert.ok(fstab.includes('UUID=abcd-1234-b /mnt/disks/disk4'))
    assert.ok(fstab.includes('/mnt/disks/disk1=RO:/mnt/disks/disk4:/mnt/disks/disk5 /mnt/storage'))
    await startBadblocks('/dev/sdb', false)
    while (getBadblocksStatus().running) await new Promise(resolve => setTimeout(resolve, 10))
    const completed = (await readFile(process.env.STORAGE_TEST_LOG, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line))
    assert.ok(completed.some(([command, args]) => command === 'stdbuf' && args.includes('badblocks') && args.includes('/dev/sdb')))
    assert.equal(getBadblocksStatus().error, null)
  } finally {
    delete process.env.STORAGE_TEST_MULTI
    process.env.PATH = oldPath
    if (oldLog === undefined) delete process.env.STORAGE_TEST_LOG; else process.env.STORAGE_TEST_LOG = oldLog
    await rm(tmp, { recursive: true, force: true })
  }
})
