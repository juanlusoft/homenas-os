import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

for (const filename of ['install.sh', 'install-x86.sh']) {
  const script = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8')
  const block = script.slice(script.indexOf('# Rebuild only the approved native dependencies'), script.indexOf('# ── TLS certificate', script.indexOf('# Rebuild only')) > 0 ? script.indexOf('# ── TLS certificate', script.indexOf('# Rebuild only')) : script.indexOf('# ── Self-signed TLS certificate'))
  test(`${filename}: native rebuild failure aborts before build and never executes as root`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'homenas-installer-test-'))
    try {
      writeFileSync(join(dir, 'sudo'), '#!/bin/bash\n[[ "$1 $2" == "-u homenas" ]] || exit 99\nshift 2\n[[ "$1 $2" == "pnpm rebuild" ]] && exit 42\nexit 91\n', { mode: 0o755 })
      const result = spawnSync('bash', ['-c', 'set -euo pipefail\ninfo() { :; }\n'+block], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } })
      assert.equal(result.status, 42, result.stderr.toString())
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  test(`${filename}: successful native checks run SQLite smoke check and build as service user`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'homenas-installer-test-'))
    try {
      writeFileSync(join(dir, 'sudo'), '#!/bin/bash\n[[ "$1 $2" == "-u homenas" ]] || exit 99\nprintf "%s\\n" "$*"\n', { mode: 0o755 })
      const result = spawnSync('bash', ['-c', 'set -euo pipefail\ninfo() { :; }\n'+block], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } })
      assert.equal(result.status, 0, result.stderr.toString())
      assert.match(result.stdout.toString(), /pnpm rebuild better-sqlite3 esbuild/)
      assert.match(result.stdout.toString(), /new Database\(":memory:"\)/)
      assert.match(result.stdout.toString(), /NODE_ENV=production pnpm -r build/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  test(`${filename}: rejects unsupported Node versions before build`, () => {
    const start = script.indexOf("if ! node -e 'const [major, minor]")
    const end = script.indexOf('\nfi', start) + 3
    for (const version of ['18.20.8', '22.11.0', '23.0.0', '22.12.0', '24.0.0']) {
      const block = script.slice(start, end).replace("node -e '", `node -e 'Object.defineProperty(process.versions,"node",{value:"${version}"});`)
      const result = spawnSync('bash', ['-c', 'error() { :; }\n'+block])
      assert.equal(result.status, ['22.12.0','24.0.0'].includes(version) ? 0 : 1, version)
    }
  })
}
