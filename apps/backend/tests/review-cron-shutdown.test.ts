import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app.js'
import { createBackupScheduler } from '../src/services/backup-scheduler.service.js'

test('independent review: server hook cancels backups before SQLite closes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homenas-review-cron-close-'))
  process.env.HOMENAS_DATA_DIR = dir
  const app = buildApp()
  let scheduler: ReturnType<typeof createBackupScheduler> | undefined
  let cancelled = false
  // db.plugin owns shutdown, independent of application hook registration order.
  try {
    await app.ready()
    scheduler = createBackupScheduler(app.db, {
      schedule: () => ({ destroy() {} }), runJob() {}, isRunning: () => false,
      cancelRunning() { assert.equal(app.db.open, true, 'backup cancellation must still be able to persist results'); cancelled = true },
      onError(error) { throw error },
    })
    scheduler.initialize()
    await app.close()
    assert.equal(cancelled, true)
  } finally { if (app.db?.open) await app.close(); await rm(dir, { recursive: true, force: true }); delete process.env.HOMENAS_DATA_DIR }
})

test('independent review: closing waits for in-flight DDNS before SQLite closes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homenas-review-ddns-close-'))
  const oldDirectory = process.env.HOMENAS_DATA_DIR
  const oldFetch = globalThis.fetch
  process.env.HOMENAS_DATA_DIR = dir
  const app = buildApp()
  const { startDdnsUpdater, stopDdnsUpdater } = await import('../src/services/ddns.service.js')
  let release!: (response: Response) => void
  const waiting = new Promise<Response>(resolve => { release = resolve })
  let updated = false
  try {
    await app.ready()
    await stopDdnsUpdater(app.db)
    app.db.prepare("INSERT INTO ddns_config (provider, domain, token) VALUES ('duckdns', 'test.duckdns.org', 'fake-token')").run()
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes('ipify')) return waiting
      assert.equal(app.db.open, true, 'DDNS must persist its result before SQLite closes')
      updated = true
      return new Response('OK')
    }) as typeof fetch
    startDdnsUpdater(app.db)
    const closing = app.close()
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(app.db.open, true)
    release(new Response('203.0.113.10'))
    await closing
    assert.equal(updated, true)
    assert.equal(app.db.open, false)
  } finally {
    release?.(new Response('203.0.113.10'))
    if (app.db?.open) await app.close()
    globalThis.fetch = oldFetch
    if (oldDirectory === undefined) delete process.env.HOMENAS_DATA_DIR; else process.env.HOMENAS_DATA_DIR = oldDirectory
    await rm(dir, { recursive: true, force: true })
  }
})
