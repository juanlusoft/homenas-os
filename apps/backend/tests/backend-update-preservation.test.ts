import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execa } from 'execa'
import { getAppUpdateMergeArgs } from '../src/services/updates.service.js'

test('application fast-forward refuses upstream collisions with ignored local custom files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homenas-update-preservation-'))
  const upstream = join(dir, 'upstream')
  const protectedCheckout = join(dir, 'protected')
  const defaultCheckout = join(dir, 'default')
  const relativeFile = 'apps/backend/src/services/catalog-sync.service.ts'
  const localContent = 'local custom service preserved\n'
  const upstreamContent = 'new upstream service\n'
  const git = (cwd: string, args: string[]) => execa('git', args, { cwd, shell: false, reject: false, env: { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } })
  const mustGit = async (cwd: string, args: string[]) => {
    const result = await git(cwd, args)
    assert.equal(result.exitCode, 0, result.stderr)
    return result.stdout.trim()
  }
  const commit = (cwd: string, message: string) => mustGit(cwd, ['-c', 'user.name=Temporary test', '-c', 'user.email=test@example.invalid', 'commit', '-m', message])
  try {
    await mkdir(upstream)
    await mustGit(upstream, ['init', '-b', 'main'])
    await writeFile(join(upstream, 'README'), 'temporary fixture\n')
    await mustGit(upstream, ['add', 'README']); await commit(upstream, 'base')
    await mustGit(dir, ['clone', upstream, protectedCheckout])
    await mustGit(dir, ['clone', upstream, defaultCheckout])
    for (const checkout of [protectedCheckout, defaultCheckout]) {
      await writeFile(join(checkout, '.git', 'info', 'exclude'), `${relativeFile}\n`)
      await mkdir(dirname(join(checkout, relativeFile)), { recursive: true })
      await writeFile(join(checkout, relativeFile), localContent)
      assert.equal(await mustGit(checkout, ['status', '--porcelain']), '')
    }
    const originalHead = await mustGit(protectedCheckout, ['rev-parse', 'HEAD'])
    await mkdir(dirname(join(upstream, relativeFile)), { recursive: true })
    await writeFile(join(upstream, relativeFile), upstreamContent)
    await mustGit(upstream, ['add', relativeFile]); await commit(upstream, 'upstream introduces colliding file')
    for (const checkout of [protectedCheckout, defaultCheckout]) await mustGit(checkout, ['fetch', 'origin'])
    // Reproduce Git's default behavior in a separate disposable checkout.
    await mustGit(defaultCheckout, ['merge', '--ff-only', 'origin/main'])
    assert.equal(await readFile(join(defaultCheckout, relativeFile), 'utf8'), upstreamContent)
    // Exercise the exact argv used by the production updater.
    const guarded = await git(protectedCheckout, getAppUpdateMergeArgs('origin/main'))
    assert.notEqual(guarded.exitCode, 0)
    assert.match(guarded.stderr, /overwritten|untracked/i)
    assert.equal(await readFile(join(protectedCheckout, relativeFile), 'utf8'), localContent)
    assert.equal(await mustGit(protectedCheckout, ['rev-parse', 'HEAD']), originalHead)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
