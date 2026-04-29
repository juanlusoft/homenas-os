import { execa, type Subprocess } from 'execa'
import { exec } from '../lib/exec.js'
import { encryptSecret, decryptSecret } from '../lib/crypto.js'
import type { Database } from 'better-sqlite3'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RemoteType =
  | 'gdrive'
  | 'dropbox'
  | 'onedrive'
  | 's3'
  | 'b2'
  | 'mega'
  | 'sftp'
  | 'ftp'
  | 'webdav'

export type JobOperation = 'sync' | 'copy' | 'move'

export interface CloudRemoteRow {
  id: number
  name: string
  type: RemoteType
  config: string
  created_at: number
}

export interface CloudRemote extends CloudRemoteRow {
  configParsed: Record<string, string>
}

export interface CloudJobRow {
  id: number
  name: string
  remote_id: number
  operation: JobOperation
  source: string
  destination: string
  cron_expression: string | null
  enabled: number
  last_run: number | null
  last_status: string
  created_at: number
}

export interface CloudTransferRow {
  id: number
  job_id: number
  started_at: number
  finished_at: number | null
  status: string
  transferred_bytes: number | null
  error_message: string | null
}

export interface RemoteInfo {
  total: number | null
  used: number | null
  free: number | null
}

export interface TransferProgress {
  running: boolean
  jobId: number | null
  transferId: number | null
  outputLines: string[]
  percent: number
}

// ─── Module-level transfer state ──────────────────────────────────────────────

interface RunningTransfer {
  jobId: number
  transferId: number
  process: Subprocess
  output: string[]
  startedAt: number
}

let activeTransfer: RunningTransfer | null = null

// ─── Rclone config path ───────────────────────────────────────────────────────

const RCLONE_CONF_DIR = '/root/.config/rclone'
const RCLONE_CONF_PATH = join(RCLONE_CONF_DIR, 'rclone.conf')

// ─── Service factory ──────────────────────────────────────────────────────────

export function createCloudBackupService(db: Database) {
  // ─── DB helpers ─────────────────────────────────────────────────────────────

  function ensureTables(): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cloud_backup_remotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS cloud_backup_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        remote_id INTEGER NOT NULL REFERENCES cloud_backup_remotes(id) ON DELETE CASCADE,
        operation TEXT NOT NULL CHECK(operation IN ('sync','copy','move')),
        source TEXT NOT NULL,
        destination TEXT NOT NULL,
        cron_expression TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run INTEGER,
        last_status TEXT NOT NULL DEFAULT 'never',
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS cloud_backup_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES cloud_backup_jobs(id) ON DELETE CASCADE,
        started_at INTEGER NOT NULL DEFAULT (unixepoch()),
        finished_at INTEGER,
        status TEXT NOT NULL DEFAULT 'running',
        transferred_bytes INTEGER,
        error_message TEXT
      );
    `)
  }

  ensureTables()

  // ─── Rclone install ──────────────────────────────────────────────────────────

  async function installRclone(): Promise<void> {
    // Try apt-get first (Debian/Ubuntu)
    const aptResult = await exec('apt-get', ['install', '-y', 'rclone'])
    if (aptResult.exitCode === 0) return

    // Fallback: official install script via curl | bash (still uses execa, no shell string)
    const curlResult = await exec('curl', ['-fsSL', 'https://rclone.org/install.sh'])
    if (curlResult.exitCode !== 0) {
      throw new Error(`Failed to download rclone install script: ${curlResult.stderr}`)
    }
    const proc = execa('bash', ['-s', '--'], {
      input: curlResult.stdout,
      shell: false,
      reject: false,
    })
    const result = await proc
    if (result.exitCode !== 0) {
      throw new Error(`rclone install script failed: ${result.stderr}`)
    }
  }

  // ─── Status ──────────────────────────────────────────────────────────────────

  async function getStatus(): Promise<{ installed: boolean; version: string | null }> {
    const result = await exec('rclone', ['version', '--check'])
    if (result.exitCode !== 0) {
      // Try without --check
      const r2 = await exec('which', ['rclone'])
      if (r2.exitCode !== 0) return { installed: false, version: null }
    }
    const vResult = await exec('rclone', ['version'])
    const match = vResult.stdout.match(/rclone\s+(v[\d.]+)/)
    return { installed: true, version: match ? match[1] : null }
  }

  // ─── Conf file helpers ───────────────────────────────────────────────────────

  function readConf(): Record<string, Record<string, string>> {
    if (!existsSync(RCLONE_CONF_PATH)) return {}
    const text = readFileSync(RCLONE_CONF_PATH, 'utf8')
    const sections: Record<string, Record<string, string>> = {}
    let current = ''
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      const sectionMatch = trimmed.match(/^\[(.+)\]$/)
      if (sectionMatch) {
        current = sectionMatch[1]
        sections[current] = {}
      } else if (current && trimmed.includes('=')) {
        const eqIdx = trimmed.indexOf('=')
        const key = trimmed.slice(0, eqIdx).trim()
        const value = trimmed.slice(eqIdx + 1).trim()
        sections[current][key] = value
      }
    }
    return sections
  }

  function writeConf(sections: Record<string, Record<string, string>>): void {
    mkdirSync(RCLONE_CONF_DIR, { recursive: true })
    const lines: string[] = []
    for (const [name, keys] of Object.entries(sections)) {
      lines.push(`[${name}]`)
      for (const [k, v] of Object.entries(keys)) {
        lines.push(`${k} = ${v}`)
      }
      lines.push('')
    }
    writeFileSync(RCLONE_CONF_PATH, lines.join('\n'), { mode: 0o600 })
  }

  // ─── Remotes ─────────────────────────────────────────────────────────────────

  function listRemotes(limit = 50, offset = 0): { items: CloudRemote[]; total: number } {
    const total = (db.prepare('SELECT COUNT(*) as n FROM cloud_backup_remotes').get() as { n: number }).n
    const rows = db.prepare('SELECT * FROM cloud_backup_remotes ORDER BY name LIMIT ? OFFSET ?').all(limit, offset) as CloudRemoteRow[]
    const items = rows.map((r) => ({
      ...r,
      configParsed: JSON.parse(decryptSecret(r.config)) as Record<string, string>,
    }))
    return { items, total }
  }

  function configureRemote(
    name: string,
    type: RemoteType,
    config: Record<string, string>
  ): CloudRemote {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error('Remote name must be alphanumeric with dashes/underscores only')
    }

    // Write to rclone.conf
    const sections = readConf()
    sections[name] = { type, ...config }
    writeConf(sections)

    // Upsert in DB — config stored encrypted
    const configJson = encryptSecret(JSON.stringify(config))
    db.prepare(`
      INSERT INTO cloud_backup_remotes (name, type, config)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET type = excluded.type, config = excluded.config
    `).run(name, type, configJson)

    const row = db.prepare('SELECT * FROM cloud_backup_remotes WHERE name = ?').get(name) as CloudRemoteRow
    return { ...row, configParsed: config }
  }

  function deleteRemote(name: string): void {
    const sections = readConf()
    if (sections[name]) {
      delete sections[name]
      writeConf(sections)
    }
    db.prepare('DELETE FROM cloud_backup_remotes WHERE name = ?').run(name)
  }

  async function getRemoteInfo(name: string): Promise<RemoteInfo> {
    const result = await exec('rclone', ['about', `${name}:`, '--json'])
    if (result.exitCode !== 0) {
      throw new Error(`rclone about failed: ${result.stderr}`)
    }
    try {
      const parsed = JSON.parse(result.stdout) as {
        total?: number
        used?: number
        free?: number
      }
      return {
        total: parsed.total ?? null,
        used: parsed.used ?? null,
        free: parsed.free ?? null,
      }
    } catch {
      return { total: null, used: null, free: null }
    }
  }

  // ─── Jobs ────────────────────────────────────────────────────────────────────

  function listJobs(limit = 50, offset = 0): { items: CloudJobRow[]; total: number } {
    const total = (db.prepare('SELECT COUNT(*) as n FROM cloud_backup_jobs').get() as { n: number }).n
    const items = db.prepare('SELECT * FROM cloud_backup_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as CloudJobRow[]
    return { items, total }
  }

  function createJob(input: {
    name: string
    remote_id: number
    operation: JobOperation
    source: string
    destination: string
    cron_expression?: string | null
    enabled?: number
  }): CloudJobRow {
    const remote = db.prepare('SELECT id FROM cloud_backup_remotes WHERE id = ?').get(input.remote_id)
    if (!remote) throw new Error('Remote not found')

    const result = db.prepare(`
      INSERT INTO cloud_backup_jobs (name, remote_id, operation, source, destination, cron_expression, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.name,
      input.remote_id,
      input.operation,
      input.source,
      input.destination,
      input.cron_expression ?? null,
      input.enabled ?? 1
    )

    return db.prepare('SELECT * FROM cloud_backup_jobs WHERE id = ?').get(result.lastInsertRowid) as CloudJobRow
  }

  function updateJob(
    id: number,
    input: Partial<{
      name: string
      operation: JobOperation
      source: string
      destination: string
      cron_expression: string | null
      enabled: number
    }>
  ): CloudJobRow {
    const existing = db.prepare('SELECT * FROM cloud_backup_jobs WHERE id = ?').get(id) as CloudJobRow | undefined
    if (!existing) throw new Error('Job not found')

    const merged = { ...existing, ...input }
    db.prepare(`
      UPDATE cloud_backup_jobs
      SET name = ?, operation = ?, source = ?, destination = ?, cron_expression = ?, enabled = ?
      WHERE id = ?
    `).run(merged.name, merged.operation, merged.source, merged.destination, merged.cron_expression, merged.enabled, id)

    return db.prepare('SELECT * FROM cloud_backup_jobs WHERE id = ?').get(id) as CloudJobRow
  }

  function deleteJob(id: number): void {
    const existing = db.prepare('SELECT id FROM cloud_backup_jobs WHERE id = ?').get(id)
    if (!existing) throw new Error('Job not found')
    if (activeTransfer && activeTransfer.jobId === id) {
      try { activeTransfer.process.kill() } catch { /* ignore */ }
      activeTransfer = null
    }
    db.prepare('DELETE FROM cloud_backup_jobs WHERE id = ?').run(id)
  }

  // ─── Transfers ───────────────────────────────────────────────────────────────

  function startTransfer(jobId: number): { started: true } {
    if (activeTransfer) {
      throw new Error('A transfer is already running')
    }

    const job = db.prepare('SELECT * FROM cloud_backup_jobs WHERE id = ?').get(jobId) as CloudJobRow | undefined
    if (!job) throw new Error('Job not found')

    const remote = db.prepare('SELECT * FROM cloud_backup_remotes WHERE id = ?').get(job.remote_id) as CloudRemoteRow | undefined
    if (!remote) throw new Error('Remote not found')

    // Create transfer record
    const result = db.prepare(`
      INSERT INTO cloud_backup_transfers (job_id, status) VALUES (?, 'running')
    `).run(jobId)
    const transferId = Number(result.lastInsertRowid)

    // Build rclone args — NEVER shell strings
    const args: string[] = [
      job.operation,
      '--progress',
      '--stats-one-line',
      '--stats', '2s',
      job.source,
      job.destination,
    ]

    const proc = execa('rclone', args, {
      shell: false,
      reject: false,
      all: true,
    })

    const outputLines: string[] = []
    const startedAt = Math.floor(Date.now() / 1000)

    activeTransfer = { jobId, transferId, process: proc, output: outputLines, startedAt }

    if (proc.all) {
      proc.all.on('data', (chunk: Buffer | string) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
        for (const line of text.split('\n')) {
          const trimmed = line.trimEnd()
          if (trimmed) {
            outputLines.push(trimmed)
            if (outputLines.length > 500) outputLines.shift()
          }
        }
      })
    }

    void proc.then((res) => {
      const finishedAt = Math.floor(Date.now() / 1000)
      const status = res.exitCode === 0 ? 'success' : 'error'
      const errorMessage = res.exitCode !== 0 ? (res.stderr ?? '').slice(0, 2048) : null

      // Parse transferred bytes from rclone output
      let transferredBytes: number | null = null
      for (let i = outputLines.length - 1; i >= 0; i--) {
        const match = outputLines[i].match(/Transferred:\s+([\d.]+\s*\w+)\s*\/\s*([\d.]+\s*\w+)/)
        if (match) {
          // Rough parse — rclone reports in human-readable form
          transferredBytes = parseRcloneBytes(match[1])
          break
        }
      }

      db.prepare(`
        UPDATE cloud_backup_transfers
        SET finished_at = ?, status = ?, transferred_bytes = ?, error_message = ?
        WHERE id = ?
      `).run(finishedAt, status, transferredBytes, errorMessage, transferId)

      db.prepare(`
        UPDATE cloud_backup_jobs SET last_run = ?, last_status = ? WHERE id = ?
      `).run(finishedAt, status, jobId)

      activeTransfer = null
    })

    return { started: true }
  }

  function getTransferProgress(): TransferProgress {
    if (!activeTransfer) {
      return { running: false, jobId: null, transferId: null, outputLines: [], percent: 0 }
    }

    const { jobId, transferId, output } = activeTransfer

    // Try to parse percentage from rclone --stats-one-line output
    let percent = 0
    for (let i = output.length - 1; i >= 0; i--) {
      const match = output[i].match(/(\d+)%/)
      if (match) {
        percent = parseInt(match[1], 10)
        break
      }
    }

    return {
      running: true,
      jobId,
      transferId,
      outputLines: output.slice(-20),
      percent,
    }
  }

  function cancelTransfer(): void {
    if (!activeTransfer) throw new Error('No transfer is currently running')

    const { transferId, jobId, startedAt, process: proc } = activeTransfer

    try {
      proc.kill('SIGTERM')
    } catch {
      // ignore
    }

    const finishedAt = Math.floor(Date.now() / 1000)
    db.prepare(`
      UPDATE cloud_backup_transfers
      SET finished_at = ?, status = 'cancelled', error_message = 'Cancelled by user'
      WHERE id = ?
    `).run(finishedAt, transferId)

    db.prepare(`
      UPDATE cloud_backup_jobs SET last_run = ?, last_status = 'error' WHERE id = ?
    `).run(startedAt, jobId)

    activeTransfer = null
  }

  // ─── History ─────────────────────────────────────────────────────────────────

  function listTransfers(limit = 50, offset = 0): { items: CloudTransferRow[]; total: number } {
    const total = (db.prepare('SELECT COUNT(*) as n FROM cloud_backup_transfers').get() as { n: number }).n
    const items = db.prepare('SELECT * FROM cloud_backup_transfers ORDER BY started_at DESC LIMIT ? OFFSET ?').all(limit, offset) as CloudTransferRow[]
    return { items, total }
  }

  return {
    installRclone,
    getStatus,
    listRemotes,
    configureRemote,
    deleteRemote,
    getRemoteInfo,
    listJobs,
    createJob,
    updateJob,
    deleteJob,
    startTransfer,
    getTransferProgress,
    cancelTransfer,
    listTransfers,
  }
}

// ─── Byte parsing helper ──────────────────────────────────────────────────────

function parseRcloneBytes(s: string): number {
  const match = s.trim().match(/^([\d.]+)\s*(\w+)?$/)
  if (!match) return 0
  const n = parseFloat(match[1])
  const unit = (match[2] ?? '').toLowerCase()
  const multipliers: Record<string, number> = {
    b: 1,
    k: 1024,
    kb: 1024,
    kib: 1024,
    m: 1024 ** 2,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    g: 1024 ** 3,
    gb: 1024 ** 3,
    gib: 1024 ** 3,
    t: 1024 ** 4,
    tb: 1024 ** 4,
    tib: 1024 ** 4,
  }
  return Math.round(n * (multipliers[unit] ?? 1))
}
