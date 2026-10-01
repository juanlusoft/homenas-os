import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, symlink, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { TOTP, Secret } from 'otpauth'
import { buildApp } from '../src/app.js'
import { createSessionsRepo } from '../src/repositories/sessions.repo.js'
import { createUsersRepo } from '../src/repositories/users.repo.js'
import { createSchedulerService } from '../src/services/scheduler.service.js'
import { checkFileSafety } from '../src/routes/files/index.js'
import { assertContainedHostPath } from '../src/lib/path-security.js'
import { validatePath, validateRealPath, validateWritableRealPath, validateNotRoot, ALL_ALLOWED_ROOTS, ALLOWED_ROOTS } from '../src/services/files.service.js'
import { validateComposeFile } from '../src/services/docker.service.js'
import { runUpdater } from '../src/services/ddns.service.js'
import { getDownloadUrl } from '../src/services/cloudflare.service.js'
import { CreateUserSchema } from '@homenas/shared'

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'homenas-backend-test-'))
  const old = process.env.HOMENAS_DATA_DIR
  process.env.HOMENAS_DATA_DIR = dir
  const app = buildApp()
  try { await app.ready() } finally {
    if (old === undefined) delete process.env.HOMENAS_DATA_DIR
    else process.env.HOMENAS_DATA_DIR = old
  }
  return { app, dir, async cleanup() { await app.close(); await rm(dir, { recursive: true, force: true }) } }
}

test('bootstrap credential changes revoke other sessions; authenticated wizard can resume; 2FA failures lock account', async () => {
  const f = await fixture()
  try {
    assert.ok(await readFile(join(f.dir, 'initial-admin-password.txt'), 'utf8'))
    const first = (await f.app.inject({ method: 'POST', url: '/api/setup/autologin' })).json()
    const other = (await f.app.inject({ method: 'POST', url: '/api/setup/autologin' })).json()
    const headers = { 'x-session-id': first.sessionId, 'x-csrf-token': first.csrfToken }
    const incomplete = await f.app.inject({ method: 'POST', url: '/api/setup/complete', headers })
    assert.equal(incomplete.statusCode, 409)
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/setup/password', headers, payload: { newPassword: 'Regression9Password', confirmPassword: 'Regression9Password' } })).statusCode, 200)
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/setup/autologin' })).statusCode, 403)
    assert.equal((await f.app.inject({ url: '/api/auth/me', headers: { 'x-session-id': other.sessionId } })).statusCode, 401)
    assert.equal((await f.app.inject({ url: '/api/auth/me', headers })).statusCode, 200)
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'Regression9Password' } })).statusCode, 200)
    const users = createUsersRepo(f.app.db)
    const secret = new Secret()
    users.setTotpSecret(first.user.id, secret.base32)
    users.enableTotp(first.user.id)
    const totp = new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 })
    const invalid = ['000000', '111111', '222222'].find(code => totp.validate({ token: code, window: 1 }) === null)!
    for (let i = 0; i < 5; i++) {
      assert.equal((await f.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'Regression9Password', totpCode: invalid } })).statusCode, 401)
    }
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'Regression9Password', totpCode: totp.generate() } })).statusCode, 429)
    assert.equal((f.app.db.prepare('SELECT count(*) n FROM login_attempts WHERE success = 0').get() as { n: number }).n, 5)
    const expired = createSessionsRepo(f.app.db)
    expired.create({ id: 'boundary-expired', userId: first.user.id, csrfToken: 'csrf', expiresAt: Math.floor(Date.now() / 1000) })
    assert.equal((await f.app.inject({ url: '/api/auth/me', headers: { 'x-session-id': 'boundary-expired' } })).statusCode, 401)
  } finally { await f.cleanup() }
})

test('scheduler rejects untrusted binaries, combined rsync interpreter flags and unsafe toggle', async () => {
  const f = await fixture()
  const service = createSchedulerService(f.app.db)
  try {
    const input = { name: 'test', description: null, cronExpression: '* * * * *', command: '/tmp/rsync', args: [], enabled: false }
    assert.throws(() => service.createTask(input), /trusted system/)
    assert.throws(() => service.createTask({ ...input, command: 'rsync', args: ['-avebash'] }), /not allowed/)
    assert.throws(() => service.createTask({ ...input, command: 'rsync', args: ['--rsync-p=bash'] }), /not allowed/)
    f.app.db.prepare("INSERT INTO scheduled_tasks (name, cron_expression, command, enabled) VALUES ('unsafe', '* * * * *', '/tmp/rsync', 0)").run()
    assert.throws(() => service.toggleTask(1), /trusted system/)
    assert.equal((f.app.db.prepare('SELECT enabled FROM scheduled_tasks WHERE id = 1').get() as { enabled: number }).enabled, 0)
    const task = service.createTask({ ...input, command: '/usr/bin/df', args: ['-h'] })
    assert.equal((await service.runNow(task.id)).lastExitCode, 0)
  } finally { service.shutdown(); await f.cleanup() }
})

test('path guards accept dotted names, reject symlink escapes/missing leaves and pool roots', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homenas-path-test-'))
  const roots = ALL_ALLOWED_ROOTS as unknown as string[]
  const writable = ALLOWED_ROOTS as unknown as string[]
  const previous = [...roots], previousWritable = [...writable]
  try {
    roots.splice(0, roots.length, `${dir}/`)
    writable.splice(0, writable.length, `${dir}/`)
    await mkdir(join(dir, 'pool'))
    await symlink('/etc', join(dir, 'pool', 'escape'))
    assert.equal(validatePath(join(dir, 'pool', 'report..txt')), join(dir, 'pool', 'report..txt'))
    await assert.rejects(validateRealPath(join(dir, 'pool', 'escape', 'passwd')), /symlink/)
    await assert.rejects(validateRealPath(join(dir, 'pool', 'escape', 'missing')), /ENOENT/)
    await assert.rejects(validateWritableRealPath(join(dir, 'pool', 'escape', 'missing')), /must start/)
    assert.throws(() => validateNotRoot(join(dir, 'pool')), /top-level/)
    assert.throws(() => assertContainedHostPath(join(dir, 'pool', 'escape', 'new', 'child'), [dir]), /symlink/)
    assert.equal(assertContainedHostPath(join(dir, 'pool', 'new', 'child'), [dir]), join(dir, 'pool', 'new', 'child'))
  } finally { roots.splice(0, roots.length, ...previous); writable.splice(0, writable.length, ...previousWritable); await rm(dir, { recursive: true, force: true }) }
})

test('upload safety checks binary signatures and case-insensitive text signatures', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homenas-upload-test-'))
  try {
    for (const bytes of [Buffer.from([0x7f,0x45,0x4c,0x46]), Buffer.from('MZ'), Buffer.from('MSCF'), Buffer.from('<!DOCTYPE html>'), Buffer.from('<SVG>')]) {
      const file = join(dir, 'payload.txt'); await writeFile(file, bytes)
      await assert.rejects(checkFileSafety(file, 'payload.txt'), /Blocked file type/)
    }
    const file = join(dir, 'safe.txt'); await writeFile(file, 'ordinary NAS document')
    await checkFileSafety(file, 'safe.txt')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('Compose validates relative binds, device access, inherited definitions and volume driver bypasses', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homenas-compose-test-'))
  try {
    const file = join(dir, 'compose.yml')
    for (const yaml of [
      'services:\n  app:\n    image: alpine\n    volumes: ["../../etc:/host"]\n',
      'services:\n  app:\n    image: alpine\n    devices: ["/dev/sda:/dev/sda"]\n',
      'services:\n  app:\n    extends: {file: other.yml, service: app}\n',
      'volumes:\n  data:\n    driver_opts: {device: /, o: bind, type: none}\nservices:\n  app:\n    image: alpine\n    volumes: ["data:/host"]\n',
    ]) { await writeFile(file, yaml); await assert.rejects(validateComposeFile(file)) }
    await writeFile(file, 'services:\n  app:\n    image: alpine\n    volumes: ["named:/data"]\n')
    await validateComposeFile(file)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('DDNS retries failed providers at unchanged IP and updates newly configured domains', async () => {
  const f = await fixture()
  const oldFetch = globalThis.fetch
  try {
    let updates = 0
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes('ipify')) return new Response('203.0.113.9')
      updates++
      return new Response(updates === 1 ? 'FAIL' : 'OK')
    }) as typeof fetch
    f.app.db.prepare("INSERT INTO ddns_config (provider, domain, token) VALUES ('duckdns', 'one.duckdns.org', 'fake-token')").run()
    await runUpdater(f.app.db); await runUpdater(f.app.db)
    assert.equal(updates, 2)
    await runUpdater(f.app.db); assert.equal(updates, 2)
    f.app.db.prepare("INSERT INTO ddns_config (provider, domain, token) VALUES ('duckdns', 'two.duckdns.org', 'fake-token')").run()
    await runUpdater(f.app.db); assert.equal(updates, 3)
  } finally { globalThis.fetch = oldFetch; await f.cleanup() }
})

test('Cloudflare selects the correct CPU binary and passwords respect bcrypt byte limits', () => {
  assert.match(getDownloadUrl('linux', 'x64'), /linux-amd64$/)
  assert.match(getDownloadUrl('linux', 'arm64'), /linux-arm64$/)
  assert.match(getDownloadUrl('darwin', 'arm64'), /darwin-arm64$/)
  assert.throws(() => getDownloadUrl('linux', 'unknown'), /Unsupported/)
  assert.equal(CreateUserSchema.safeParse({ username: 'valid', password: 'A9' + 'x'.repeat(71) }).success, false)
  assert.equal(CreateUserSchema.safeParse({ username: 'valid', password: 'A9' + 'ñ'.repeat(36) }).success, false)
  assert.equal(CreateUserSchema.safeParse({ username: 'valid', password: 'A9' + 'x'.repeat(70) }).success, true)
})
