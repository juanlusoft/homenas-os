import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findNasBranchUsagePath } from '../src/services/storage.service.js'
import type { exec } from '../src/lib/exec.js'

test('missing logical cache branch measures only its existing mounted NAS ancestor', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'homenas-missing-cache-'))
  try {
    const base = join(temp, 'disks')
    const cache = join(base, 'cache1')
    await mkdir(cache, { recursive: true })
    const logical = join(cache, 'pool-cache', 'absent')
    const calls: string[][] = []
    const mounted: typeof exec = async (command, args) => {
      assert.equal(command, 'findmnt')
      calls.push(args)
      assert.equal(args.at(-1), cache, 'query only existing ancestor, never absent branch or root')
      return { stdout: cache, stderr: '', exitCode: 0 }
    }
    assert.equal(await findNasBranchUsagePath(logical, base, mounted), cache)
    assert.equal(calls.length, 1)
    const hostRoot: typeof exec = async () => ({ stdout: '/', stderr: '', exitCode: 0 })
    assert.equal(await findNasBranchUsagePath(logical, base, hostRoot), null)
    assert.equal(await findNasBranchUsagePath(join(base, 'absent', 'missing'), base, mounted), null)
    assert.equal(await findNasBranchUsagePath(join(base, '..', 'outside'), base, mounted), null)
    const outside = join(temp, 'outside')
    await mkdir(outside)
    await symlink(outside, join(base, 'escape'))
    assert.equal(await findNasBranchUsagePath(join(base, 'escape', 'missing'), base, mounted), null)
    await symlink(cache, join(base, 'alias'))
    assert.equal(await findNasBranchUsagePath(join(base, 'alias', 'missing'), base, mounted), null)
  } finally { await rm(temp, { recursive: true, force: true }) }
})
