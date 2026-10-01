import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app.js'

test('retired Active Directory/Active Backup APIs return 404; legacy database records and ordinary backups survive restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homenas-retired-modules-'))
  const previousDirectory = process.env.HOMENAS_DATA_DIR
  process.env.HOMENAS_DATA_DIR = dir
  let app = buildApp()
  try {
    await app.ready()
    const session = (await app.inject({ method: 'POST', url: '/api/setup/autologin' })).json()
    const headers = { 'x-session-id': session.sessionId, 'x-csrf-token': session.csrfToken }
    // Historical migrations and data are intentionally retained, even though their APIs are absent.
    app.db.prepare("INSERT INTO ab_devices (name, hostname, token) VALUES ('legacy device', 'legacy host', 'legacy-test-token')").run()
    app.db.prepare("INSERT INTO ab_backup_runs (device_id, version, status) VALUES (1, 'v1', 'success')").run()
    app.db.prepare("INSERT INTO ab_sessions (id, device_id, run_id, version, expires_at) VALUES ('legacy-session', 1, 1, 'v1', 2000000000)").run()
    app.db.prepare("INSERT INTO settings (key, value) VALUES ('ad_domain', 'legacy.example.invalid')").run()
    const retiredRequests = [
      ['GET', '/api/ad/status'], ['GET', '/api/ad/users'], ['GET', '/api/ad/groups'], ['GET', '/api/ad/computers'],
      ['POST', '/api/ad/install'], ['POST', '/api/ad/provision'], ['POST', '/api/ad/restart'],
      ['GET', '/api/active-backup/devices'], ['POST', '/api/active-backup/devices'],
      ['DELETE', '/api/active-backup/devices/1'], ['POST', '/api/active-backup/devices/1/backup'],
      ['GET', '/api/active-backup/devices/1/agent-package?platform=linux'],
      ['POST', '/api/active-backup/agent/heartbeat'], ['POST', '/api/active-backup/agent/backup/start'],
      ['POST', '/api/active-backup/agent/backup/file'], ['POST', '/api/active-backup/agent/backup/complete'],
    ] as const
    for (const [method, url] of retiredRequests) {
      assert.equal((await app.inject({ method, url, headers })).statusCode, 404, `${method} ${url}`)
    }
    assert.equal((await app.inject({ url: '/api/backup/jobs', headers })).statusCode, 200)
    assert.equal((await app.inject({ url: '/api/cloud-backup/jobs', headers })).statusCode, 200)
    assert.equal(app.hasRoute({ method: 'GET', url: '/api/network/samba/shares' }), true)
    const migrationsBefore = app.db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
    await app.close()
    app = buildApp(); await app.ready()
    assert.equal((app.db.prepare('SELECT name FROM ab_devices WHERE id = 1').get() as { name: string }).name, 'legacy device')
    assert.equal((app.db.prepare('SELECT version FROM ab_backup_runs WHERE id = 1').get() as { version: string }).version, 'v1')
    assert.equal((app.db.prepare('SELECT id FROM ab_sessions').get() as { id: string }).id, 'legacy-session')
    assert.equal((app.db.prepare("SELECT value FROM settings WHERE key = 'ad_domain'").get() as { value: string }).value, 'legacy.example.invalid')
    assert.deepEqual(app.db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), migrationsBefore)
  } finally {
    if (app.db?.open) await app.close()
    if (previousDirectory === undefined) delete process.env.HOMENAS_DATA_DIR; else process.env.HOMENAS_DATA_DIR = previousDirectory
    await rm(dir, { recursive: true, force: true })
  }
})
