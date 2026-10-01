import assert from 'node:assert/strict'
import { test, mock as testMock } from 'node:test'
import fsPromises from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { mkdtemp, writeFile, symlink, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getMergerFSStatus } from '../src/services/storage.service.js'

test('independent storage review: branch policies and cache subpaths never measure root', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'homenas-review-storage-'))
  const oldPath = process.env.PATH
  const oldLog = process.env.REVIEW_STORAGE_LOG
  process.env.PATH = directory
  process.env.REVIEW_STORAGE_LOG = join(directory, 'commands.jsonl')
  const mock = join(directory, 'mock')
  await writeFile(mock, `#!/usr/bin/python3
import os,sys,json
command=os.path.basename(sys.argv[0]);args=sys.argv[1:]
if command=='sudo':os.execvp(args[0],args)
with open(os.environ['REVIEW_STORAGE_LOG'],'a') as log:log.write(json.dumps([command,args])+'\\n')
if command=='cat':print('/mnt/disks/disk1 /mnt/review-pool fuse.mergerfs rw 0 0')
elif command=='getfattr':print('/mnt/disks/disk1=RO:/mnt/disks/cache1/pool-cache=NC:/mnt/disks/missing/pool=RW')
elif command=='find':pass
elif command=='mountpoint':sys.exit(0 if args[-1]=='/mnt/disks/disk1' else 32)
elif command=='findmnt':print('/mnt/disks/cache1' if args[-1].startswith('/mnt/disks/cache1') else '/mnt/disks/disk1' if args[-1]=='/mnt/disks/disk1' else '/')
elif command=='df':print('Size Used\\n1000 200')
else:sys.exit(99)
`, { mode: 0o700 })
  for (const name of ['sudo', 'cat', 'getfattr', 'find', 'mountpoint', 'findmnt', 'df']) await symlink(mock, join(directory, name))
  const originalLstat = fsPromises.lstat
  const originalRealpath = fsPromises.realpath
  const fakeDirectories = new Set(['/mnt/disks/disk1', '/mnt/disks/cache1', '/mnt/disks/missing'])
  const directoryStat = await originalLstat(directory)
  const lstatMock = testMock.method(fsPromises, 'lstat', async (path: Parameters<typeof originalLstat>[0]) => {
    if (fakeDirectories.has(String(path))) return directoryStat
    if (String(path).startsWith('/mnt/disks/')) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return originalLstat(path)
  })
  const realpathMock = testMock.method(fsPromises, 'realpath', async (path: Parameters<typeof originalRealpath>[0]) => fakeDirectories.has(String(path)) ? String(path) : originalRealpath(path))
  syncBuiltinESMExports()
  try {
    const status = await getMergerFSStatus()
    assert.equal(status.mountPoint, '/mnt/review-pool')
    assert.deepEqual(status.drives.map(drive => [drive.path, drive.role]), [['/mnt/disks/disk1', 'data'], ['/mnt/disks/cache1/pool-cache', 'cache']])
    assert.equal(status.totalBytes, 1000)
    assert.equal(status.usedBytes, 200)
    const calls = (await readFile(process.env.REVIEW_STORAGE_LOG, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as [string, string[]])
    assert.deepEqual(calls.filter(([command]) => command === 'df').map(([, args]) => args.at(-1)), ['/mnt/disks/disk1', '/mnt/disks/cache1'])
    assert.ok(calls.every(([command]) => ['cat', 'getfattr', 'find', 'mountpoint', 'findmnt', 'df'].includes(command)))
  } finally {
    lstatMock.mock.restore(); realpathMock.mock.restore(); syncBuiltinESMExports()
    process.env.PATH = oldPath
    if (oldLog === undefined) delete process.env.REVIEW_STORAGE_LOG; else process.env.REVIEW_STORAGE_LOG = oldLog
    await rm(directory, { recursive: true, force: true })
  }
})
