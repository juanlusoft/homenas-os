import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import Fastify from 'fastify'
import dbPlugin from '../src/plugins/db.plugin.js'

const temp = await mkdtemp(join(tmpdir(), 'homenas-active-backup-'))
process.env.AB_STORAGE_ROOT = join(temp, 'storage')
process.env.HOMENAS_DATA_DIR = join(temp, 'db')
const { createActiveBackupService } = await import('../src/services/active-backup.service.js')
const { activeBackupRoutes } = await import('../src/routes/active-backup/index.js')
const app = Fastify()
app.decorate('requireAuth', async () => {})
app.decorate('requireAdmin', async () => {})
await app.register(dbPlugin)
await app.register(activeBackupRoutes, { prefix: '/api/active-backup' })
await app.ready()
const svc = createActiveBackupService(app.db)
const device = svc.registerDevice({ name: 'regression', hostname: 'test', os_type: 'linux' })
svc.approveDevice(device.id)
const token = device.token
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex')
const begin = () => svc.beginBackupSession(token, { device_name: 'regression', hostname: 'test', os_type: 'linux' })

test('real multipart consumes file and validates full backup, including empty files and hardlink dedup', async () => {
  try {
    const session = begin()
    assert.throws(begin, /already running/)
    const data = Buffer.alloc(100_000, 'x')
    const manifest = [{ path: 'dir/data.txt', hash: hash(data), size: data.length, mtime: 1000 }, { path: 'empty', hash: hash(Buffer.alloc(0)), size: 0, mtime: 1000 }]
    await assert.rejects(svc.endBackupSession(session.session_id, token, { status: 'success', error_message: null, files_count: 2, size_bytes: data.length, manifest }), /Incomplete/)
    const fields = { session_id: session.session_id, path: manifest[0].path, hash: manifest[0].hash, mtime: '1000', size: String(data.length), chunk_index: '0', total_chunks: '1' }
    const boundary = 'backup-test-boundary'
    const parts = Object.entries(fields).map(([name, value]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="chunk"\r\nContent-Type: application/octet-stream\r\n\r\n`), data, Buffer.from(`\r\n--${boundary}--\r\n`))
    const response = await app.inject({ method: 'POST', url: '/api/active-backup/agent/backup/file', headers: { 'x-agent-token': token, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat(parts) })
    assert.equal(response.statusCode, 200, response.body)
    await svc.receiveFileChunk(session.session_id, token, { path: 'empty', hash: manifest[1].hash, size: 0, mtime: 1000, chunkIndex: 0, totalChunks: 1, dataStream: Readable.from([]) })
    await svc.endBackupSession(session.session_id, token, { status: 'success', error_message: null, files_count: 2, size_bytes: data.length, manifest })
    assert.deepEqual(await readFile(join(temp, 'storage', String(device.id), 'latest', 'files', 'dir', 'data.txt')), data)
    const next = begin()
    assert.equal(next.previous_version, session.version)
    assert.deepEqual(svc.checkFiles(next.session_id, token, manifest).already_have.sort(), ['dir/data.txt', 'empty'])
    await svc.endBackupSession(next.session_id, token, { status: 'success', error_message: null, files_count: 2, size_bytes: data.length, manifest })
    const third = begin()
    for (const path of ['../escape', '/etc/passwd', 'a/../../escape']) {
      assert.throws(() => svc.checkFiles(third.session_id, token, [{ ...manifest[0], path }]), /Invalid relative/)
    }
    await assert.rejects(svc.receiveFileChunk(third.session_id, token, { path: 'bad', hash: hash(data), size: data.length + 1, mtime: 1000, chunkIndex: 0, totalChunks: 1, dataStream: Readable.from([data]) }), /size mismatch/)
    await svc.endBackupSession(third.session_id, token, { status: 'error', error_message: 'intentional failure', files_count: 0, size_bytes: 0, manifest: [] })
    const fourth = begin()
    assert.equal(fourth.previous_version, next.version, 'failed version must not become dedup base')
    await svc.endBackupSession(fourth.session_id, token, { status: 'error', error_message: 'intentional', files_count: 0, size_bytes: 0, manifest: [] })
    svc.updateDevice(device.id, { backup_paths: ['/home'] })
    const queued = svc.triggerBackup(device.id)
    assert.equal(svc.pollForTask(token).status, 'backup')
    assert.equal(svc.pollForTask(token).status, 'waiting')
    const fifth = begin()
    assert.equal((app.db.prepare('SELECT run_id FROM ab_sessions WHERE id = ?').get(fifth.session_id) as { run_id: number }).run_id, queued.run_id)
    await svc.endBackupSession(fifth.session_id, token, { status: 'error', error_message: 'intentional', files_count: 0, size_bytes: 0, manifest: [] })
  } finally { await app.close(); await rm(temp, { recursive: true, force: true }) }
})
