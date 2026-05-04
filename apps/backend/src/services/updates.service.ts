import { execa } from 'execa'
import type { Database } from 'better-sqlite3'
import { exec, sudoWrap } from '../lib/exec.js'
import { getSetting, setSetting } from '../lib/settings.js'
import { resolve } from 'node:path'

// Repo root is two levels up from apps/backend (WorkingDirectory in systemd)
const REPO_ROOT = resolve(process.cwd(), '../..')

// ─── Types ─────────────────────────────────────────────────────────────────────

export type UpdateProcessStatus = 'idle' | 'updating' | 'done' | 'error'

export interface AppUpdateInfo {
  currentCommit: string
  pendingCommits: string[]  // oneline log entries
}

export interface OsUpdateInfo {
  packages: OsPackage[]
}

export interface OsPackage {
  name: string
  currentVersion: string
  newVersion: string
  description: string
}

export interface UpdateStatus {
  app: AppUpdateInfo
  os: OsUpdateInfo
  process: {
    status: UpdateProcessStatus
    type: 'app' | 'os' | null
    output: string
    startedAt: number | null
    finishedAt: number | null
    error: string | null
  }
}

// ─── In-memory process state ──────────────────────────────────────────────────

interface ProcessState {
  status: UpdateProcessStatus
  type: 'app' | 'os' | null
  output: string
  startedAt: number | null
  finishedAt: number | null
  error: string | null
}

let processState: ProcessState = {
  status: 'idle',
  type: null,
  output: '',
  startedAt: null,
  finishedAt: null,
  error: null,
}

export function getUpdateProcessState(): ProcessState {
  return { ...processState }
}

// ─── checkForUpdates ──────────────────────────────────────────────────────────

export async function checkForUpdates(): Promise<UpdateStatus> {
  const app = await checkAppUpdates()
  const os = await checkOsUpdates()

  return {
    app,
    os,
    process: getUpdateProcessState(),
  }
}

async function checkAppUpdates(): Promise<AppUpdateInfo> {
  const gitOpts = { cwd: REPO_ROOT, shell: false, reject: false } as const

  // Allow git to operate under sudo/different owner
  await execa('git', ['config', '--global', '--add', 'safe.directory', REPO_ROOT], { shell: false, reject: false })

  const currentResult = await exec('git', ['rev-parse', '--short', 'HEAD'])
  const currentCommit = currentResult.exitCode === 0 ? currentResult.stdout.trim() : 'unknown'

  await execa('git', ['fetch', 'origin'], gitOpts)

  // Use remote HEAD to detect the default branch — avoids failures when local
  // branch is a feature branch that no longer exists on origin
  const remoteHeadResult = await execa('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], gitOpts)
  const remoteRef = remoteHeadResult.stdout?.trim() || 'refs/remotes/origin/main'

  const logResult = await execa('git', ['log', `HEAD..${remoteRef}`, '--oneline'], gitOpts)
  const pendingCommits = logResult.exitCode === 0
    ? logResult.stdout.split('\n').filter(Boolean)
    : []

  return { currentCommit, pendingCommits }
}

async function checkOsUpdates(): Promise<OsUpdateInfo> {
  // Update apt cache
  await exec('apt-get', ['update', '-qq'])

  // Simulate upgrade to list packages
  const simulateResult = await exec('apt-get', ['--simulate', 'upgrade'])

  if (simulateResult.exitCode !== 0) {
    return { packages: [] }
  }

  const packages: OsPackage[] = []
  const lines = simulateResult.stdout.split('\n')

  for (const line of lines) {
    // Lines like: Inst packagename [oldVer] (newVer source)
    const match = line.match(/^Inst\s+(\S+)\s+(?:\[([^\]]+)\]\s+)?\((\S+)/)
    if (!match) continue
    const [, name, currentVersion, newVersion] = match
    packages.push({
      name: name ?? '',
      currentVersion: currentVersion ?? 'installed',
      newVersion: newVersion ?? '',
      description: '',
    })
  }

  return { packages: packages.slice(0, 200) }  // cap at 200 packages
}

// ─── updateApp ────────────────────────────────────────────────────────────────

export function updateApp(): void {
  if (processState.status === 'updating') {
    throw new Error('An update is already in progress')
  }

  processState = {
    status: 'updating',
    type: 'app',
    output: '',
    startedAt: Math.floor(Date.now() / 1000),
    finishedAt: null,
    error: null,
  }

  // Run in background — no await
  void runAppUpdate()
}

async function runAppUpdate(): Promise<void> {
  const append = (text: string) => {
    processState.output += text + '\n'
  }

  // Repo is owned by homenas (install.sh sets chown -R homenas:homenas).
  // git/pnpm run as homenas directly — no sudo needed.
  // Only systemctl restart requires sudo (escalation allowed since NoNewPrivileges is not set).
  const run = (cmd: string, args: string[], extra?: object) =>
    execa(cmd, args, { cwd: REPO_ROOT, shell: false, reject: false, all: true, ...extra })

  try {
    append('=== Starting app update ===')

    // Fetch latest from origin (prune stale/corrupted remote refs first)
    append('> git remote prune origin')
    await run('git', ['remote', 'prune', 'origin'])

    append('> git fetch origin')
    const fetchResult = await run('git', ['fetch', 'origin'])
    append(fetchResult.all ?? '')
    if (fetchResult.exitCode !== 0) {
      throw new Error(`git fetch failed: ${fetchResult.stderr}`)
    }

    // Detect the default remote branch (HEAD → origin/main or origin/master)
    const remoteHeadResult = await run('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'])
    const remoteHead = remoteHeadResult.stdout?.trim().replace('refs/remotes/', '') || 'origin/main'
    append(`remote HEAD: ${remoteHead}`)

    // Ensure we are on the default branch locally before resetting
    const defaultBranch = remoteHead.replace('origin/', '')
    const checkoutResult = await run('git', ['checkout', '-B', defaultBranch, remoteHead])
    append(checkoutResult.all ?? '')

    // Hard reset to remote — more reliable than pull (no merge conflicts)
    append(`> git reset --hard ${remoteHead}`)
    const resetResult = await run('git', ['reset', '--hard', remoteHead])
    append(resetResult.all ?? '')
    if (resetResult.exitCode !== 0) {
      throw new Error(`git reset failed: ${resetResult.stderr}`)
    }

    // Install dependencies — CI=true skips TTY confirmation for node_modules removal
    append('> pnpm install --frozen-lockfile')
    const installResult = await run('pnpm', ['install', '--frozen-lockfile', '--config.confirmModulesPurge=false'], {
      env: { ...process.env, CI: 'true' },
    })
    append(installResult.all ?? '')
    if (installResult.exitCode !== 0) {
      throw new Error(`pnpm install failed: ${installResult.stderr}`)
    }

    // Fix ownership — dist/ dirs may have been created as root in a previous run
    append('> chown -R homenas:homenas (repo)')
    await execa(...sudoWrap('chown', ['-R', 'homenas:homenas', REPO_ROOT]), {
      shell: false, reject: false,
    })

    // Build all packages
    append('> pnpm -r build')
    const buildResult = await run('pnpm', ['-r', 'build'])
    append(buildResult.all ?? '')
    if (buildResult.exitCode !== 0) {
      throw new Error(`pnpm build failed: ${buildResult.stderr}`)
    }

    // Restart service — needs sudo (homenas has NOPASSWD: ALL in sudoers)
    append('> systemctl restart homenas.service')
    const restartResult = await execa(...sudoWrap('systemctl', ['restart', 'homenas.service']), {
      shell: false, reject: false, all: true,
    })
    append(restartResult.all ?? '')
    if (restartResult.exitCode !== 0) {
      throw new Error(`systemctl restart failed: ${restartResult.stderr}`)
    }

    append('=== App update completed successfully ===')
    processState.status = 'done'
    processState.finishedAt = Math.floor(Date.now() / 1000)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    processState.status = 'error'
    processState.error = message
    processState.finishedAt = Math.floor(Date.now() / 1000)
    append(`=== ERROR: ${message} ===`)
  }
}

// ─── updateOs ─────────────────────────────────────────────────────────────────

export function updateOs(packages: string[]): void {
  if (processState.status === 'updating') {
    throw new Error('An update is already in progress')
  }

  processState = {
    status: 'updating',
    type: 'os',
    output: '',
    startedAt: Math.floor(Date.now() / 1000),
    finishedAt: null,
    error: null,
  }

  // Run in background
  void runOsUpdate(packages)
}

async function runOsUpdate(packages: string[]): Promise<void> {
  const append = (text: string) => {
    processState.output += text + '\n'
  }

  try {
    append('=== Starting OS update ===')

    const cmd = packages.length > 0 ? 'apt-get install' : 'apt-get upgrade'
    append(`> ${cmd} ${packages.join(' ')}`)

    const result = await execa(...sudoWrap('apt-get', ['upgrade', '-y', ...packages]), {
      shell: false,
      reject: false,
      all: true,
      env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' },
    })
    append(result.all ?? '')

    if (result.exitCode !== 0) {
      throw new Error(`apt-get upgrade failed: ${result.stderr}`)
    }

    append('=== OS update completed successfully ===')
    processState.status = 'done'
    processState.finishedAt = Math.floor(Date.now() / 1000)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    processState.status = 'error'
    processState.error = message
    processState.finishedAt = Math.floor(Date.now() / 1000)
    append(`=== ERROR: ${message} ===`)
  }
}

// ─── Auto-update poller ───────────────────────────────────────────────────────

export interface AutoUpdateConfig {
  enabled: boolean
  intervalMinutes: number
}

let _autoDb: Database | null = null
let _autoTimer: ReturnType<typeof setInterval> | null = null
let _autoConfig: AutoUpdateConfig = { enabled: true, intervalMinutes: 30 }
let _lastAutoCheck: number | null = null
let _lastAutoApply: number | null = null

export function getAutoUpdateConfig(): AutoUpdateConfig & { lastCheckAt: number | null; lastApplyAt: number | null } {
  return { ..._autoConfig, lastCheckAt: _lastAutoCheck, lastApplyAt: _lastAutoApply }
}

export function setAutoUpdateConfig(config: AutoUpdateConfig): void {
  _autoConfig = { ...config }
  if (_autoDb) setSetting(_autoDb, 'auto_update_config', JSON.stringify(config))
  _restartAutoTimer()
}

export function initAutoUpdatePoller(db: Database): void {
  _autoDb = db
  const raw = getSetting(db, 'auto_update_config')
  if (raw) {
    try { _autoConfig = JSON.parse(raw) as AutoUpdateConfig } catch { /* use defaults */ }
  }
  _restartAutoTimer()
}

function _restartAutoTimer(): void {
  if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null }
  if (!_autoConfig.enabled) return
  const ms = Math.max(5, _autoConfig.intervalMinutes) * 60 * 1000
  _autoTimer = setInterval(() => { void _autoPoll() }, ms)
  // Run once after 1 minute on startup so the first check happens quickly
  setTimeout(() => { void _autoPoll() }, 60_000)
}

async function _autoPoll(): Promise<void> {
  _lastAutoCheck = Date.now()
  try {
    const app = await checkAppUpdates()
    if (app.pendingCommits.length === 0) return
    if (processState.status === 'updating') return

    console.log(`[auto-update] ${app.pendingCommits.length} new commit(s) detected — applying update`)
    _lastAutoApply = Date.now()
    updateApp()
  } catch (err) {
    console.error('[auto-update] poll error:', (err as Error).message)
  }
}
