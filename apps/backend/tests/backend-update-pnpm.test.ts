import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { APP_UPDATE_PNPM_PACKAGE, getAppUpdatePnpmCommand } from '../src/services/updates.service.js'

test('updater launches the repository-pinned pnpm through npm exec, never the incompatible global executable', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(APP_UPDATE_PNPM_PACKAGE, manifest.packageManager)
  const temporary = await mkdtemp(join(tmpdir(), 'homenas-pnpm-launcher-'))
  try {
    const fakeNpm = join(temporary, 'npm')
    const incompatiblePnpm = join(temporary, 'pnpm')
    // Both are isolated fixtures. No package download or recursive package-manager process runs.
    await writeFile(fakeNpm, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({args:process.argv.slice(2),ci:process.env.CI}));\n`)
    await writeFile(incompatiblePnpm, `#!${process.execPath}\nprocess.stderr.write('incompatible global pnpm must never execute'); process.exit(99);\n`)
    await chmod(fakeNpm, 0o700); await chmod(incompatiblePnpm, 0o700)
    for (const args of [['install', '--frozen-lockfile', '--config.confirmModulesPurge=false'], ['-r', 'build']]) {
      const [command, argv] = getAppUpdatePnpmCommand(args)
      assert.equal(command, 'npm')
      const result = await execa(command, argv, { shell: false, env: { PATH: `${temporary}:${process.env.PATH}`, CI: 'true' } })
      assert.deepEqual(JSON.parse(result.stdout), { args: ['exec', '--yes', '--package=pnpm@9.15.9', '--', 'pnpm', ...args], ci: 'true' })
    }
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
