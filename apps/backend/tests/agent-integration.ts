// Full protocol regression: native Go agent -> TCP -> Fastify -> SQLite/files.
// Run after building Go agent: HOMENAS_AGENT_BINARY=/path/to/agent pnpm test:integration
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const binary = process.env.HOMENAS_AGENT_BINARY
assert.ok(binary, 'Set HOMENAS_AGENT_BINARY to a built agent executable')
const root = await mkdtemp(join(tmpdir(), 'homenas-agent-e2e-'))
process.env.HOMENAS_DATA_DIR = join(root, 'database')
process.env.AB_STORAGE_ROOT = join(root, 'storage')
process.env.LOG_LEVEL = 'silent'
const { buildApp } = await import('../src/app.js')
const app = buildApp()
try {
  const origin = await app.listen({ host: '127.0.0.1', port: 0 })
  async function api(path: string, body?: unknown, headers: Record<string,string> = {}) {
    const result = await fetch(origin + '/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    assert.ok(result.ok, `${path}: ${result.status} ${await result.clone().text()}`)
    return result.json()
  }
  const session = await api('/setup/autologin', {})
  const headers = { 'x-session-id': session.sessionId, 'x-csrf-token': session.csrfToken }
  await api('/setup/password', { newPassword: 'IntegrationPassword123', confirmPassword: 'IntegrationPassword123' }, headers)
  const device = await api('/active-backup/devices', { name: 'e2e-agent', hostname: 'localhost', os_type: 'linux' }, headers)
  const source = join(root, 'source'), config = join(root, 'agent-config')
  await mkdir(source); await mkdir(config)
  const empty = join(source, 'empty.txt'), file = join(source, 'important.txt'), big = join(source, 'multi-chunk.bin')
  await writeFile(empty, ''); await writeFile(file, 'important data'); await writeFile(big, Buffer.alloc(4*1024*1024+37, 42))
  const cfg = { nas_url: origin, token: device.token, device_name: 'e2e-agent', backup_paths: [source], schedule_cron: '' }
  await writeFile(join(config, 'config.json'), JSON.stringify(cfg))
  const exec = promisify(execFile)
  const backup = () => exec(binary, ['--backup'], { env: { ...process.env, HOMENAS_CONFIG_DIR: config }, timeout: 30_000 })
  await backup()
  const key = source.replace(/^\//, '')
  const version = (n: number, name: string) => join(root, 'storage', String(device.id), `v${n}`, 'files', key, name)
  assert.equal(await readFile(version(1, 'important.txt'), 'utf8'), 'important data')
  assert.equal((await stat(version(1, 'empty.txt'))).size, 0)
  assert.equal((await stat(version(1, 'multi-chunk.bin'))).size, 4*1024*1024+37)
  await backup()
  assert.equal((await stat(version(1, 'important.txt'))).ino, (await stat(version(2, 'important.txt'))).ino, 'unchanged version should hardlink')
  // Remove previous NAS version, retaining the local manifest. Unchanged files
  // must be resent because server no longer possesses them.
  await rm(join(root, 'storage', String(device.id), 'v2'), { recursive: true })
  await backup()
  assert.equal(await readFile(version(2, 'important.txt'), 'utf8'), 'important data')
  const before = await readFile(join(config, 'manifest.json'), 'utf8')
  await writeFile(join(config, 'config.json'), JSON.stringify({ ...cfg, backup_paths: [join(root,'missing')] }))
  await assert.rejects(backup(), /backup failed/)
  assert.equal(await readFile(join(config, 'manifest.json'), 'utf8'), before)
  const runs = app.db.prepare('SELECT status FROM ab_backup_runs ORDER BY id').all() as { status: string }[]
  assert.deepEqual(runs.map(run => run.status), ['success','success','success','error'])
  console.log('PASS Go/TCP/Fastify/SQLite: empty+multichunk uploads, incremental hardlinks, NAS missing files recovery, failed backup status and manifest preservation')
} finally {
  await app.close()
  await rm(root, { recursive: true, force: true })
}
