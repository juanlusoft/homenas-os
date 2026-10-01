import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { buildApp } from '../src/app.js'
import { createBackupScheduler } from '../src/services/backup-scheduler.service.js'
import { createBackupService } from '../src/services/backup.service.js'
import { createCloudBackupService } from '../src/services/cloud-backup.service.js'

test('backup cron initializes persisted jobs, preserves runners/contracts, refreshes API edits and stops cleanly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homenas-backup-cron-'))
  const old = process.env.HOMENAS_DATA_DIR
  process.env.HOMENAS_DATA_DIR = dir
  const app = buildApp()
  try { await app.ready() } finally { if (old === undefined) delete process.env.HOMENAS_DATA_DIR; else process.env.HOMENAS_DATA_DIR = old }
  const timers: { expression: string; fire: () => Promise<void>; destroyed: boolean }[] = []
  const errors: { message: string; kind: string; id: number }[] = []
  const launched: { kind: string; id: number }[] = []
  const local = createBackupService(app.db)
  const cloud = createCloudBackupService(app.db)
  let busy = false
  let fail = false
  let deferred: Promise<void> | undefined
  const scheduler = createBackupScheduler(app.db, {
    schedule: (expression, fire) => {
      const timer = { expression, fire, destroyed: false }; timers.push(timer)
      return { destroy() { timer.destroyed = true } }
    },
    runJob: async (kind, id) => { launched.push({ kind, id }); if (fail) throw new Error('simulated runner failure'); await deferred },
    isRunning: () => busy,
    cancelRunning() {},
    onError: (error, kind, id) => errors.push({ message: (error as Error).message, kind, id }),
  })
  try {
    const input = { name: 'local', description: null, type: 'tar' as const, source: '/tmp/source', destination: '/tmp/archive.tgz', cronExpression: '0 2 * * *', enabled: true, retentionDays: 7, extraArgs: ['--exclude=cache'] }
    const localJob = local.createJob(input)
    local.createJob({ ...input, name: 'disabled', enabled: false })
    local.createJob({ ...input, name: 'manual', cronExpression: null })
    const remote = app.db.prepare("INSERT INTO cloud_backup_remotes (name, type) VALUES ('testremote', 's3')").run()
    const cloudJob = cloud.createJob({ name: 'cloud', remote_id: Number(remote.lastInsertRowid), operation: 'copy', source: '/tmp/source', destination: 'testremote:backup', cron_expression: '0 3 * * *', enabled: 1 })
    app.db.prepare("INSERT INTO backup_jobs (name,type,source,destination,cron_expression) VALUES ('invalid legacy','rsync','/tmp/a','/tmp/b','invalid')").run()
    scheduler.initialize(); scheduler.initialize()
    assert.equal(timers.length, 2)
    assert.deepEqual(errors, [{ message: 'Ignoring stored invalid backup cron expression', kind: 'local', id: 4 }])
    await timers[0]!.fire(); await timers[1]!.fire()
    assert.deepEqual(launched, [{ kind: 'local', id: localJob.id }, { kind: 'cloud', id: cloudJob.id }])
    const persisted = local.listJobs().find(job => job.id === localJob.id)!
    assert.equal(persisted.type, 'tar'); assert.deepEqual(persisted.extraArgs, ['--exclude=cache']); assert.equal(persisted.retentionDays, 7)
    busy = true; await timers[0]!.fire(); assert.equal(launched.length, 2); busy = false
    fail = true; await timers[0]!.fire(); fail = false
    assert.match(errors.at(-1)!.message, /simulated runner failure/)
    await timers[0]!.fire(); assert.equal(launched.length, 4)
    let release!: () => void
    deferred = new Promise<void>(resolve => { release = resolve })
    const firstFire = timers[0]!.fire()
    await timers[0]!.fire() // duplicate tick before async starter completes
    release(); await firstFire; deferred = undefined
    assert.equal(launched.length, 5)
    const login = (await app.inject({ method: 'POST', url: '/api/setup/autologin' })).json()
    const headers = { 'x-session-id': login.sessionId, 'x-csrf-token': login.csrfToken }
    const priorCount = timers.length
    const createdLocal = await app.inject({ method: 'POST', url: '/api/backup/jobs', headers, payload: { ...input, name: 'created by API' } })
    assert.equal(createdLocal.statusCode, 201); assert.equal(timers.length, priorCount + 1)
    const createdLocalTimer = timers.at(-1)!
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/backup/jobs/${createdLocal.json().id}`, headers })).statusCode, 200)
    assert.equal(createdLocalTimer.destroyed, true)
    const createdCloud = await app.inject({ method: 'POST', url: '/api/cloud-backup/jobs', headers, payload: { name: 'created cloud', remote_id: Number(remote.lastInsertRowid), operation: 'copy', source: '/tmp/a', destination: 'testremote:b', cron_expression: '10 6 * * *' } })
    assert.equal(createdCloud.statusCode, 201); assert.equal(timers.at(-1)!.expression, '10 6 * * *')
    const createdCloudTimer = timers.at(-1)!
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/cloud-backup/jobs/${createdCloud.json().id}`, headers })).statusCode, 200)
    assert.equal(createdCloudTimer.destroyed, true)
    assert.equal((await app.inject({ method: 'PUT', url: `/api/backup/jobs/${localJob.id}`, headers, payload: { cronExpression: '30 4 * * *' } })).statusCode, 200)
    assert.equal(timers[0]!.destroyed, true)
    assert.equal(timers.at(-1)!.expression, '30 4 * * *')
    const beforeStale = launched.length
    await timers[0]!.fire(); assert.equal(launched.length, beforeStale)
    assert.equal((await app.inject({ method: 'PUT', url: `/api/cloud-backup/jobs/${cloudJob.id}`, headers, payload: { enabled: 0 } })).statusCode, 200)
    assert.equal(timers[1]!.destroyed, true)
    await timers[1]!.fire(); assert.equal(launched.length, beforeStale)
    assert.equal((await app.inject({ method: 'PUT', url: `/api/cloud-backup/jobs/${cloudJob.id}`, headers, payload: { enabled: 1, cron_expression: '15 5 * * *' } })).statusCode, 200)
    assert.equal(timers.at(-1)!.expression, '15 5 * * *')
    const cloudTimer = timers.at(-1)!
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/cloud-backup/jobs/${cloudJob.id}`, headers })).statusCode, 200)
    assert.equal(cloudTimer.destroyed, true)
    const localTimer = timers.find(timer => timer.expression === '30 4 * * *')!
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/backup/jobs/${localJob.id}`, headers })).statusCode, 200)
    assert.equal(localTimer.destroyed, true)
    assert.throws(() => local.createJob({ ...input, cronExpression: 'invalid' }), /Invalid backup cron/)
    assert.throws(() => cloud.createJob({ name: 'bad', remote_id: Number(remote.lastInsertRowid), operation: 'copy', source: '/tmp/a', destination: 'testremote:b', cron_expression: 'invalid' }), /Invalid backup cron/)
    assert.throws(() => cloud.updateJob(999, { enabled: 2 }), /enabled must/)
    await scheduler.shutdown()
    for (const timer of timers) await timer.fire()
    assert.equal(launched.length, beforeStale)
  } finally { await scheduler.shutdown(); await app.close(); await rm(dir, { recursive: true, force: true }) }
})

test('actual node-cron clock dispatches an enabled persisted backup without running system commands', async () => {
  const db = new Database(':memory:')
  db.exec("CREATE TABLE backup_jobs (id INTEGER PRIMARY KEY, enabled INTEGER, cron_expression TEXT); INSERT INTO backup_jobs VALUES (1, 1, '* * * * * *')")
  let dispatch!: () => void
  const fired = new Promise<void>(resolve => { dispatch = resolve })
  const failures: unknown[] = []
  let invocations = 0
  const scheduler = createBackupScheduler(db, {
    runJob(kind, id) { assert.equal(kind, 'local'); assert.equal(id, 1); invocations++; dispatch() },
    isRunning: () => false,
    cancelRunning() {},
    onError: error => failures.push(error),
  })
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    scheduler.initialize()
    await Promise.race([fired, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('node-cron did not dispatch within 3 seconds')), 3000) })])
    assert.equal(invocations, 1)
    assert.deepEqual(failures, [])
  } finally { if (timeout) clearTimeout(timeout); await scheduler.shutdown(); db.close() }
})
