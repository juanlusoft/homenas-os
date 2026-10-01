import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import dbPlugin from '../src/plugins/db.plugin.js'

const dir = await mkdtemp(join(tmpdir(), 'homenas-review-backup-'))
process.env.HOMENAS_DATA_DIR = join(dir, 'db')
process.env.AB_STORAGE_ROOT = join(dir, 'storage')
const { createActiveBackupService } = await import('../src/services/active-backup.service.js')
const app = Fastify()
await app.register(dbPlugin)
await app.ready()
const svc = createActiveBackupService(app.db)
const device = svc.registerDevice({ name: 'review', hostname: 'review', os_type: 'linux' })
svc.approveDevice(device.id)
const begin = () => svc.beginBackupSession(device.token, { device_name: 'review', hostname: 'review', os_type: 'linux' })

test('independent review: expired interrupted backup can be retried', async () => {
  const old = begin()
  app.db.prepare('UPDATE ab_sessions SET expires_at = unixepoch() - 1 WHERE id = ?').run(old.session_id)
  const next = begin()
  assert.notEqual(next.session_id, old.session_id)
  await svc.endBackupSession(next.session_id, device.token, { status: 'error', error_message: 'review cleanup', files_count: 0, size_bytes: 0, manifest: [] })
})

test('independent review: queued push backup exposes running state and can be cancelled', () => {
  // Separate device so an earlier failing assertion cannot obscure this contract.
  const push = svc.registerDevice({ name: 'queued-review', hostname: 'queued-review', os_type: 'linux' })
  svc.approveDevice(push.id)
  svc.updateDevice(push.id, { backup_paths: ['/home'] })
  const queued = svc.triggerBackup(push.id)
  assert.equal(svc.getRunProgress(push.id).running, true, 'UI must expose queued backup as busy')
  assert.doesNotThrow(() => svc.cancelBackup(push.id))
  assert.equal(svc.pollForTask(push.token).status, 'waiting')
  assert.equal((app.db.prepare('SELECT status FROM ab_backup_runs WHERE id = ?').get(queued.run_id) as {status: string}).status, 'cancelled')
})

test('independent review: polling never approves an unapproved agent', () => {
  const pending = svc.registerDevice({ name: 'pending-review', hostname: 'pending-review', os_type: 'linux' })
  assert.equal(svc.pollForTask(pending.token).status, 'pending')
  assert.equal(svc.getDevice(pending.id).status, 'pending')
  assert.throws(() => svc.beginBackupSession(pending.token, { device_name: 'pending-review', hostname: 'pending-review', os_type: 'linux' }), /not yet approved/)
})

test.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); delete process.env.HOMENAS_DATA_DIR; delete process.env.AB_STORAGE_ROOT })
