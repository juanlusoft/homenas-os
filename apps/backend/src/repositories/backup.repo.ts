import type { Database } from 'better-sqlite3'
import type { BackupJob, BackupRun, CreateBackupJobInput } from '@homenas/shared'

interface BackupJobRow {
  id: number
  name: string
  description: string | null
  type: string
  source: string
  destination: string
  cron_expression: string | null
  enabled: number
  retention_days: number | null
  extra_args: string
  last_run: number | null
  last_status: string
  last_duration: number | null
  created_at: number
}

interface BackupRunRow {
  id: number
  job_id: number
  started_at: number
  finished_at: number | null
  status: string
  exit_code: number | null
  output: string | null
  size_bytes: number | null
  duration: number | null
}

function rowToJob(row: BackupJobRow): BackupJob {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as BackupJob['type'],
    source: row.source,
    destination: row.destination,
    cronExpression: row.cron_expression,
    enabled: row.enabled === 1,
    retentionDays: row.retention_days,
    extraArgs: JSON.parse(row.extra_args) as string[],
    lastRun: row.last_run,
    lastStatus: row.last_status as BackupJob['lastStatus'],
    lastDuration: row.last_duration,
    createdAt: row.created_at,
  }
}

function rowToRun(row: BackupRunRow): BackupRun {
  return {
    id: row.id,
    jobId: row.job_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status as BackupRun['status'],
    exitCode: row.exit_code,
    output: row.output,
    sizeBytes: row.size_bytes,
    duration: row.duration,
  }
}

export function createBackupRepo(db: Database) {
  return {
    // ── Jobs ──────────────────────────────────────────────────────────────

    listJobs(): BackupJob[] {
      const rows = db.prepare('SELECT * FROM backup_jobs ORDER BY id').all() as BackupJobRow[]
      return rows.map(rowToJob)
    },

    getJob(id: number): BackupJob | undefined {
      const row = db.prepare('SELECT * FROM backup_jobs WHERE id = ?').get(id) as BackupJobRow | undefined
      return row ? rowToJob(row) : undefined
    },

    createJob(input: CreateBackupJobInput): BackupJob {
      const result = db.prepare(`
        INSERT INTO backup_jobs (name, description, type, source, destination, cron_expression, enabled, retention_days, extra_args)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.name,
        input.description,
        input.type,
        input.source,
        input.destination,
        input.cronExpression,
        input.enabled ? 1 : 0,
        input.retentionDays,
        JSON.stringify(input.extraArgs),
      )
      const row = db.prepare('SELECT * FROM backup_jobs WHERE id = ?').get(result.lastInsertRowid) as BackupJobRow
      return rowToJob(row)
    },

    updateJob(id: number, input: Partial<CreateBackupJobInput>): BackupJob {
      const fields: string[] = []
      const values: unknown[] = []

      if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name) }
      if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description) }
      if (input.type !== undefined) { fields.push('type = ?'); values.push(input.type) }
      if (input.source !== undefined) { fields.push('source = ?'); values.push(input.source) }
      if (input.destination !== undefined) { fields.push('destination = ?'); values.push(input.destination) }
      if (input.cronExpression !== undefined) { fields.push('cron_expression = ?'); values.push(input.cronExpression) }
      if (input.enabled !== undefined) { fields.push('enabled = ?'); values.push(input.enabled ? 1 : 0) }
      if (input.retentionDays !== undefined) { fields.push('retention_days = ?'); values.push(input.retentionDays) }
      if (input.extraArgs !== undefined) { fields.push('extra_args = ?'); values.push(JSON.stringify(input.extraArgs)) }

      if (fields.length > 0) {
        values.push(id)
        db.prepare(`UPDATE backup_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values)
      }

      const row = db.prepare('SELECT * FROM backup_jobs WHERE id = ?').get(id) as BackupJobRow
      return rowToJob(row)
    },

    deleteJob(id: number): void {
      db.prepare('DELETE FROM backup_jobs WHERE id = ?').run(id)
    },

    updateJobStatus(
      id: number,
      status: BackupJob['lastStatus'],
      lastRun: number,
      duration?: number,
    ): void {
      db.prepare(`
        UPDATE backup_jobs SET last_status = ?, last_run = ?, last_duration = ? WHERE id = ?
      `).run(status, lastRun, duration ?? null, id)
    },

    // ── Runs ─────────────────────────────────────────────────────────────

    listRuns(jobId: number, limit = 20): BackupRun[] {
      const rows = db.prepare(
        'SELECT * FROM backup_runs WHERE job_id = ? ORDER BY started_at DESC LIMIT ?'
      ).all(jobId, limit) as BackupRunRow[]
      return rows.map(rowToRun)
    },

    createRun(jobId: number): BackupRun {
      const result = db.prepare(
        'INSERT INTO backup_runs (job_id) VALUES (?)'
      ).run(jobId)
      const row = db.prepare('SELECT * FROM backup_runs WHERE id = ?').get(result.lastInsertRowid) as BackupRunRow
      return rowToRun(row)
    },

    finishRun(
      id: number,
      data: {
        status: BackupRun['status']
        exitCode?: number
        output?: string
        sizeBytes?: number
        duration?: number
      },
    ): void {
      db.prepare(`
        UPDATE backup_runs
        SET status = ?, exit_code = ?, output = ?, size_bytes = ?, duration = ?, finished_at = ?
        WHERE id = ?
      `).run(
        data.status,
        data.exitCode ?? null,
        data.output ?? null,
        data.sizeBytes ?? null,
        data.duration ?? null,
        Math.floor(Date.now() / 1000),
        id,
      )
    },
  }
}
