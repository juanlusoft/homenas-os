import type { Database } from 'better-sqlite3'
import type { AbDevice, AbBackupRun, UpdateDeviceInput } from '@homenas/shared'

// ─── Row types ────────────────────────────────────────────────────────────────

interface AbDeviceRow {
  id: number
  name: string
  hostname: string | null
  os_type: string
  token: string
  status: string
  last_seen: number | null
  backup_path: string | null
  backup_paths: string | null  // JSON array stored as text
  schedule_cron: string | null
  retention_days: number
  created_at: number
  // joined
  last_run_at?: number | null
  last_run_status?: string | null
}

export interface AbSession {
  id: string
  device_id: number
  run_id: number
  version: string
  previous_version: string | null
  already_have: string[]  // parsed from JSON
  created_at: number
  expires_at: number
}

interface AbSessionRow {
  id: string
  device_id: number
  run_id: number
  version: string
  previous_version: string | null
  already_have: string
  created_at: number
  expires_at: number
}

interface AbBackupRunRow {
  id: number
  device_id: number
  started_at: number
  finished_at: number | null
  status: string
  version: string | null
  size_bytes: number | null
  files_count: number | null
  error_message: string | null
  created_at: number
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function rowToDevice(row: AbDeviceRow): AbDevice {
  let backup_paths: string[] | null = null
  if (row.backup_paths) {
    try { backup_paths = JSON.parse(row.backup_paths) } catch { backup_paths = null }
  }
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    os_type: row.os_type as AbDevice['os_type'],
    token: row.token,
    status: row.status as AbDevice['status'],
    last_seen: row.last_seen,
    backup_path: row.backup_path,
    backup_paths,
    schedule_cron: row.schedule_cron,
    retention_days: row.retention_days,
    created_at: row.created_at,
    last_run_at: row.last_run_at ?? null,
    last_run_status: row.last_run_status ?? null,
  }
}

function rowToSession(row: AbSessionRow): AbSession {
  let already_have: string[] = []
  try { already_have = JSON.parse(row.already_have) } catch { already_have = [] }
  return {
    id: row.id,
    device_id: row.device_id,
    run_id: row.run_id,
    version: row.version,
    previous_version: row.previous_version,
    already_have,
    created_at: row.created_at,
    expires_at: row.expires_at,
  }
}

function rowToRun(row: AbBackupRunRow): AbBackupRun {
  return {
    id: row.id,
    device_id: row.device_id,
    started_at: row.started_at,
    finished_at: row.finished_at,
    status: row.status as AbBackupRun['status'],
    version: row.version,
    size_bytes: row.size_bytes,
    files_count: row.files_count,
    error_message: row.error_message,
    created_at: row.created_at,
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

export function createActiveBackupRepo(db: Database) {
  return {
    // ── Devices ───────────────────────────────────────────────────────────

    listDevices(limit = 50, offset = 0): AbDevice[] {
      const rows = db.prepare(`
        SELECT d.*,
               r.started_at AS last_run_at,
               r.status     AS last_run_status
        FROM ab_devices d
        LEFT JOIN ab_backup_runs r ON r.id = (
          SELECT id FROM ab_backup_runs
          WHERE device_id = d.id
          ORDER BY started_at DESC LIMIT 1
        )
        ORDER BY d.id DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset) as AbDeviceRow[]
      return rows.map(rowToDevice)
    },

    countDevices(): number {
      return (db.prepare('SELECT COUNT(*) as n FROM ab_devices').get() as { n: number }).n
    },

    getDevice(id: number): AbDevice | undefined {
      const row = db.prepare(`
        SELECT d.*,
               r.started_at AS last_run_at,
               r.status     AS last_run_status
        FROM ab_devices d
        LEFT JOIN ab_backup_runs r ON r.id = (
          SELECT id FROM ab_backup_runs
          WHERE device_id = d.id
          ORDER BY started_at DESC LIMIT 1
        )
        WHERE d.id = ?
      `).get(id) as AbDeviceRow | undefined
      return row ? rowToDevice(row) : undefined
    },

    getDeviceByToken(token: string): AbDevice | undefined {
      const row = db.prepare(`
        SELECT d.*,
               r.started_at AS last_run_at,
               r.status     AS last_run_status
        FROM ab_devices d
        LEFT JOIN ab_backup_runs r ON r.id = (
          SELECT id FROM ab_backup_runs
          WHERE device_id = d.id
          ORDER BY started_at DESC LIMIT 1
        )
        WHERE d.token = ?
      `).get(token) as AbDeviceRow | undefined
      return row ? rowToDevice(row) : undefined
    },

    createDevice(input: {
      name: string
      hostname: string | null
      os_type: string
      token: string
    }): AbDevice {
      const result = db.prepare(`
        INSERT INTO ab_devices (name, hostname, os_type, token)
        VALUES (?, ?, ?, ?)
      `).run(input.name, input.hostname, input.os_type, input.token)
      const row = db.prepare('SELECT * FROM ab_devices WHERE id = ?').get(result.lastInsertRowid) as AbDeviceRow
      return rowToDevice(row)
    },

    updateDeviceStatus(id: number, status: AbDevice['status']): void {
      db.prepare('UPDATE ab_devices SET status = ? WHERE id = ?').run(status, id)
    },

    updateDeviceLastSeen(id: number): void {
      db.prepare('UPDATE ab_devices SET last_seen = unixepoch(), status = ? WHERE id = ?').run('active', id)
    },

    updateDevice(id: number, patch: UpdateDeviceInput): void {
      const sets: string[] = []
      const vals: unknown[] = []
      if (patch.hostname !== undefined)      { sets.push('hostname = ?');       vals.push(patch.hostname) }
      if (patch.backup_paths !== undefined)  { sets.push('backup_paths = ?');   vals.push(JSON.stringify(patch.backup_paths)) }
      if (patch.schedule_cron !== undefined) { sets.push('schedule_cron = ?');  vals.push(patch.schedule_cron) }
      if (patch.retention_days !== undefined){ sets.push('retention_days = ?'); vals.push(patch.retention_days) }
      if (sets.length === 0) return
      vals.push(id)
      db.prepare(`UPDATE ab_devices SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    },

    deleteDevice(id: number): void {
      db.prepare('DELETE FROM ab_devices WHERE id = ?').run(id)
    },

    // ── Sessions ──────────────────────────────────────────────────────────

    createSession(data: {
      id: string
      device_id: number
      run_id: number
      version: string
      previous_version: string | null
    }): void {
      db.prepare(`
        INSERT INTO ab_sessions (id, device_id, run_id, version, previous_version, expires_at)
        VALUES (?, ?, ?, ?, ?, unixepoch() + 86400)
      `).run(data.id, data.device_id, data.run_id, data.version, data.previous_version)
    },

    getSession(id: string): AbSession | undefined {
      const row = db.prepare('SELECT * FROM ab_sessions WHERE id = ? AND expires_at > unixepoch()').get(id) as AbSessionRow | undefined
      return row ? rowToSession(row) : undefined
    },

    appendSessionAlreadyHave(id: string, paths: string[]): void {
      const row = db.prepare('SELECT already_have FROM ab_sessions WHERE id = ?').get(id) as { already_have: string } | undefined
      if (!row) return
      let existing: string[] = []
      try { existing = JSON.parse(row.already_have) } catch { existing = [] }
      const merged = [...new Set([...existing, ...paths])]
      db.prepare('UPDATE ab_sessions SET already_have = ? WHERE id = ?').run(JSON.stringify(merged), id)
    },

    deleteSession(id: string): void {
      db.prepare('DELETE FROM ab_sessions WHERE id = ?').run(id)
    },

    purgeExpiredSessions(): void {
      db.prepare('DELETE FROM ab_sessions WHERE expires_at < unixepoch()').run()
    },

    // ── Runs ──────────────────────────────────────────────────────────────

    listRuns(deviceId: number, limit = 30): AbBackupRun[] {
      const rows = db.prepare(`
        SELECT * FROM ab_backup_runs
        WHERE device_id = ?
        ORDER BY started_at DESC
        LIMIT ?
      `).all(deviceId, limit) as AbBackupRunRow[]
      return rows.map(rowToRun)
    },

    getRunById(id: number): AbBackupRun | undefined {
      const row = db.prepare('SELECT * FROM ab_backup_runs WHERE id = ?').get(id) as AbBackupRunRow | undefined
      return row ? rowToRun(row) : undefined
    },

    getRunningRunForDevice(deviceId: number): AbBackupRun | undefined {
      const row = db.prepare(`
        SELECT * FROM ab_backup_runs
        WHERE device_id = ? AND status = 'running'
        ORDER BY started_at DESC LIMIT 1
      `).get(deviceId) as AbBackupRunRow | undefined
      return row ? rowToRun(row) : undefined
    },

    createRun(deviceId: number, version: string): AbBackupRun {
      const result = db.prepare(`
        INSERT INTO ab_backup_runs (device_id, version)
        VALUES (?, ?)
      `).run(deviceId, version)
      const row = db.prepare('SELECT * FROM ab_backup_runs WHERE id = ?').get(result.lastInsertRowid) as AbBackupRunRow
      return rowToRun(row)
    },

    finishRun(
      id: number,
      data: {
        status: AbBackupRun['status']
        size_bytes?: number | null
        files_count?: number | null
        error_message?: string | null
      },
    ): void {
      db.prepare(`
        UPDATE ab_backup_runs
        SET status = ?, finished_at = unixepoch(), size_bytes = ?, files_count = ?, error_message = ?
        WHERE id = ?
      `).run(
        data.status,
        data.size_bytes ?? null,
        data.files_count ?? null,
        data.error_message ?? null,
        id,
      )
    },
  }
}
