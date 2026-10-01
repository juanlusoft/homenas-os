#!/usr/bin/env node
// Build every supported client without installing tools globally or using root.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const run = promisify(execFile)
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const cwd = join(root, 'apps/agent')
const version = '1.25.14'
// Official go.dev/dl metadata, verified 2026-10-01. Updating requires a new hash.
const checksums = {
  arm64: '9bf234ea70ffec9347fdf6b22ce4add51717d3386a38a441e8c8743fceb5eaee',
  amd64: 'a21ae5633a269bcd7e90cf767e48225633795e99d831742cbf3397064fee7712',
}
let go = process.env.HOMENAS_GO_BINARY || 'go'
try {
  const { stdout } = await run(go, ['version'])
  const match = stdout.match(/go(\d+)\.(\d+)/)
  if (!match || Number(match[1]) < 1 || Number(match[1]) === 1 && Number(match[2]) < 25) throw new Error('Go 1.25+ required')
} catch (error) {
  if (process.env.HOMENAS_GO_BINARY) throw error
  if (process.platform !== 'linux') throw new Error('Install Go 1.25+ and run pnpm build:agent; automatic tool bootstrap supports Linux only')
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch]
  if (!arch) throw new Error(`Unsupported Go bootstrap architecture: ${process.arch}`)
  const tools = join(root, '.homenas-tools', `go-${version}-${arch}`)
  go = join(tools, 'go/bin/go')
  try { await access(go) } catch {
    await mkdir(tools, { recursive: true })
    const temp = await mkdtemp(join(tmpdir(), 'homenas-go-build-'))
    try {
      console.log(`Downloading verified Go ${version} (${arch}) for agent builds`)
      const response = await fetch(`https://go.dev/dl/go${version}.linux-${arch}.tar.gz`, { signal: AbortSignal.timeout(120_000) })
      if (!response.ok) throw new Error(`Go download failed: HTTP ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (createHash('sha256').update(bytes).digest('hex') !== checksums[arch]) throw new Error('Go download SHA-256 mismatch')
      const archive = join(temp, 'go.tar.gz')
      await writeFile(archive, bytes, { mode: 0o600 })
      await run('tar', ['-xzf', archive, '-C', tools])
    } finally { await rm(temp, { recursive: true, force: true }) }
  }
}
await mkdir(join(cwd, 'build'), { recursive: true })
for (const [os, arch, filename] of [
  ['windows', 'amd64', 'homenas-agent.exe'],
  ['linux', 'amd64', 'homenas-agent-linux'],
  ['linux', 'arm64', 'homenas-agent-linux-arm64'],
  ['darwin', 'amd64', 'homenas-agent-mac-amd64'],
  ['darwin', 'arm64', 'homenas-agent-mac-arm64'],
]) {
  await run(go, ['build', '-trimpath', '-ldflags=-s -w', '-o', join('build', filename), '.'], {
    cwd, env: { ...process.env, GOOS: os, GOARCH: arch, CGO_ENABLED: '0' }, timeout: 120_000,
  })
  console.log(`Built ${filename} (${os}/${arch})`)
}
