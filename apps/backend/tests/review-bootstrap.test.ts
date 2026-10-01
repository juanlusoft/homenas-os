import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app.js'

test('independent review: a concurrently revoked bootstrap session cannot overwrite administrator password', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homenas-review-bootstrap-'))
  process.env.HOMENAS_DATA_DIR = dir
  const app = buildApp()
  try {
    await app.ready()
    const sessions = []
    for (let i = 0; i < 2; i++) sessions.push((await app.inject({ method: 'POST', url: '/api/setup/autologin' })).json())
    const passwords = ['Review9PasswordFirst', 'Review9PasswordSecond']
    const results = await Promise.all(sessions.map((s, i) => app.inject({ method: 'POST', url: '/api/setup/password', headers: { 'x-session-id': s.sessionId, 'x-csrf-token': s.csrfToken }, payload: { newPassword: passwords[i], confirmPassword: passwords[i] } })))
    assert.equal(results.filter(r => r.statusCode === 200).length, 1, `Only one bootstrap change may commit; statuses: ${results.map(r => r.statusCode)}`)
    const winner = results.findIndex(r => r.statusCode === 200)
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: passwords[winner] } })).statusCode, 200)
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); delete process.env.HOMENAS_DATA_DIR }
})

test('independent review: login cannot issue sessions from stale password, TOTP or deleted-user state', async (t) => {
  const bcrypt = (await import('bcryptjs')).default
  const { createUsersRepo } = await import('../src/repositories/users.repo.js')
  const { setSetting } = await import('../src/lib/settings.js')
  for (const change of ['password', 'totp', 'delete', 'lockout']) await t.test(change, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'homenas-review-login-'))
    process.env.HOMENAS_DATA_DIR = dir
    const app = buildApp()
    const original = bcrypt.compare
    try {
      await app.ready()
      setSetting(app.db, 'setup_complete', '1')
      const repo = createUsersRepo(app.db)
      const user = repo.findFirstAdmin()!
      let signalEntered!: () => void
      const entered = new Promise<void>(r => { signalEntered = r })
      let release!: (valid: boolean) => void
      const gate = new Promise<boolean>(r => { release = r })
      bcrypt.compare = ((..._args: unknown[]) => { signalEntered(); return gate }) as typeof bcrypt.compare
      const pending = app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: user.username, password: 'OldReview9Password' } })
      const running = Promise.resolve(pending)
      await entered
      if (change === 'password') repo.updatePassword(user.id, 'new-hash-from-concurrent-admin-reset')
      if (change === 'totp') { repo.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP'); repo.enableTotp(user.id) }
      if (change === 'delete') repo.delete(user.id)
      if (change === 'lockout') for (let i = 0; i < 5; i++) app.db.prepare('INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, 0)').run(user.username, 'review-other-ip')
      release(true)
      const response = await running
      assert.equal(response.statusCode, change === 'lockout' ? 429 : 401, `Concurrent ${change} must invalidate the old authentication snapshot`)
      assert.equal((app.db.prepare('SELECT count(*) n FROM sessions').get() as {n: number}).n, 0)
    } finally { bcrypt.compare = original; await app.close(); await rm(dir, { recursive: true, force: true }); delete process.env.HOMENAS_DATA_DIR }
  })
})
