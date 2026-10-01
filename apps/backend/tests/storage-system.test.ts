import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import dbPlugin from '../src/plugins/db.plugin.js'
import { systemRoutes } from '../src/routes/system/index.js'
import { updateOs } from '../src/services/updates.service.js'

test('database downloads use live SQLite with custom data directory; SSH command failures do not report success', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'homenas-system-regression-'))
  const oldDir = process.env.HOMENAS_DATA_DIR
  const oldPath = process.env.PATH
  process.env.HOMENAS_DATA_DIR = join(temp, 'custom-data')
  const app = Fastify()
  app.decorate('requireAuth', async () => {})
  app.decorate('requireAdmin', async () => {})
  app.addHook('preHandler', async req => { (req as unknown as { user: { id: number; username: string } }).user = { id: 1, username: 'admin' } })
  await app.register(dbPlugin)
  await app.register(systemRoutes, { prefix: '/api/system' })
  await app.ready()
  try {
    const [one, two] = await Promise.all([app.inject('/api/system/db-backup'), app.inject('/api/system/db-backup')])
    for (const response of [one, two]) {
      assert.equal(response.statusCode, 200)
      assert.equal(response.rawPayload.subarray(0, 15).toString(), 'SQLite format 3')
      assert.equal(Number(response.headers['content-length']), response.rawPayload.length)
    }
    await writeFile(join(temp, 'systemctl'), '#!/bin/sh\nif [ "$1" = "cat" ]; then exit 0; fi\necho denied >&2\nexit 1\n', { mode: 0o700 })
    await writeFile(join(temp, 'sudo'), '#!/bin/sh\nexec "$@"\n', { mode: 0o700 })
    process.env.PATH = temp
    for (const action of ['enable', 'disable']) {
      const result = await app.inject({ method: 'POST', url: `/api/system/ssh/${action}` })
      assert.equal(result.statusCode, 500)
      assert.equal(result.json().error, 'System Error')
    }
    assert.equal((app.db.prepare("SELECT count(*) n FROM audit_log WHERE action IN ('ssh_enabled', 'ssh_disabled')").get() as { n: number }).n, 0)
    assert.throws(() => updateOs(['--allow-unauthenticated']), /Invalid package/)
  } finally {
    process.env.PATH = oldPath
    if (oldDir === undefined) delete process.env.HOMENAS_DATA_DIR; else process.env.HOMENAS_DATA_DIR = oldDir
    await app.close(); await rm(temp, { recursive: true, force: true })
  }
})
