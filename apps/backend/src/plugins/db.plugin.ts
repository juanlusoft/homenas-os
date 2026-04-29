import fp from 'fastify-plugin'
import Database from 'better-sqlite3'
import bcryptjs from 'bcryptjs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database
  }
}

// ─── Migration definitions ────────────────────────────────────────────────────
// Each migration runs exactly once, tracked in schema_migrations.
// To add a new migration: append { version: N, up(db) { ... } }
// Never modify existing migrations — add new ones instead.

const MIGRATIONS: Array<{ version: number; up: (db: Database.Database) => void }> = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
          totp_secret TEXT,
          totp_enabled INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          csrf_token TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS scheduled_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          cron_expression TEXT NOT NULL,
          command TEXT NOT NULL,
          args TEXT NOT NULL DEFAULT '[]',
          enabled INTEGER NOT NULL DEFAULT 1,
          last_run INTEGER,
          last_exit_code INTEGER,
          last_output TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL DEFAULT 'info' CHECK(type IN ('info','warning','error','success')),
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          read INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS backup_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          type TEXT NOT NULL CHECK(type IN ('rsync','tar','rclone')),
          source TEXT NOT NULL,
          destination TEXT NOT NULL,
          cron_expression TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          retention_days INTEGER,
          extra_args TEXT NOT NULL DEFAULT '[]',
          last_run INTEGER,
          last_status TEXT NOT NULL DEFAULT 'never' CHECK(last_status IN ('success','error','running','never')),
          last_duration INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS backup_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id INTEGER NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
          started_at INTEGER NOT NULL DEFAULT (unixepoch()),
          finished_at INTEGER,
          status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','success','error','cancelled')),
          exit_code INTEGER,
          output TEXT,
          size_bytes INTEGER,
          duration INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS ab_devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          hostname TEXT,
          os_type TEXT NOT NULL DEFAULT 'linux' CHECK(os_type IN ('windows','mac','linux')),
          token TEXT UNIQUE NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','active','error','offline')),
          last_seen INTEGER,
          backup_path TEXT,
          schedule_cron TEXT,
          retention_days INTEGER NOT NULL DEFAULT 30,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS ab_backup_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id INTEGER NOT NULL REFERENCES ab_devices(id) ON DELETE CASCADE,
          started_at INTEGER NOT NULL DEFAULT (unixepoch()),
          finished_at INTEGER,
          status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','success','error','cancelled')),
          version TEXT,
          size_bytes INTEGER,
          files_count INTEGER,
          error_message TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

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

        CREATE TABLE IF NOT EXISTS ddns_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL CHECK(provider IN ('duckdns','noip','cloudflare','dynu')),
          domain TEXT NOT NULL,
          token TEXT NOT NULL,
          username TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          last_update INTEGER,
          last_ip TEXT,
          last_status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `)
    },
  },
  {
    version: 2,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS login_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          ip TEXT NOT NULL,
          success INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time
          ON login_attempts(username, created_at);

        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          username TEXT,
          action TEXT NOT NULL,
          detail TEXT,
          ip TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_audit_log_created
          ON audit_log(created_at DESC);
      `)
    },
  },
  {
    version: 3,
    up(db) {
      // Idle session timeout — column tracks last activity for 8-hour inactivity check
      db.exec(`ALTER TABLE sessions ADD COLUMN idle_expires_at INTEGER DEFAULT 0`)
    },
  },
  {
    version: 4,
    up(db) {
      // Push-based agent backup support
      db.exec(`
        ALTER TABLE ab_devices ADD COLUMN backup_paths TEXT;

        CREATE TABLE IF NOT EXISTS ab_sessions (
          id TEXT PRIMARY KEY,
          device_id INTEGER NOT NULL REFERENCES ab_devices(id) ON DELETE CASCADE,
          run_id INTEGER NOT NULL REFERENCES ab_backup_runs(id) ON DELETE CASCADE,
          version TEXT NOT NULL,
          previous_version TEXT,
          already_have TEXT NOT NULL DEFAULT '[]',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          expires_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_ab_sessions_device
          ON ab_sessions(device_id);
      `)
    },
  },
  {
    version: 5,
    up(db) {
      // Network drives — rclone FUSE mounts managed via UI
      db.exec(`
        CREATE TABLE IF NOT EXISTS network_drives (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          type TEXT NOT NULL,
          config TEXT NOT NULL DEFAULT '{}',
          mount_point TEXT NOT NULL,
          is_mounted INTEGER NOT NULL DEFAULT 0,
          auto_mount INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `)
    },
  },
]

function runMigrations(db: Database.Database): void {
  // Bootstrap the migrations tracker table itself
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)

  const getApplied = db.prepare('SELECT version FROM schema_migrations WHERE version = ?')
  const markApplied = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)')

  for (const migration of MIGRATIONS) {
    if (getApplied.get(migration.version)) continue // already applied

    db.transaction(() => {
      migration.up(db)
      markApplied.run(migration.version)
    })()
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

async function dbPlugin(fastify: FastifyInstance) {
  const dbDir = join(process.cwd(), 'data')
  mkdirSync(dbDir, { recursive: true })

  const dbPath = join(dbDir, 'homenas.db')
  const db = new Database(dbPath)

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Run pending migrations (idempotent — safe on every startup)
  runMigrations(db)

  // Quick integrity check on startup — warn but don't crash
  const integrityRows = db.pragma('integrity_check') as { integrity_check: string }[]
  if (integrityRows.length !== 1 || integrityRows[0]?.integrity_check !== 'ok') {
    fastify.log.error({ details: integrityRows.map(r => r.integrity_check) }, 'DB integrity check FAILED — consider restoring from backup')
  }

  // Seed default admin if no users exist
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count
  if (userCount === 0) {
    // Generate a random initial password — displayed once in logs, changed via setup wizard
    const initialPassword = randomBytes(10).toString('base64url') // ~14 URL-safe chars
    const passwordHash = bcryptjs.hashSync(initialPassword, 10)
    db.prepare(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`
    ).run('admin', passwordHash, 'admin')
    fastify.log.info(
      { initialPassword },
      '*** FIRST RUN: default admin created. Use this password in the setup wizard, then change it immediately. ***'
    )
  }

  // Purge expired sessions on startup
  db.prepare('DELETE FROM sessions WHERE expires_at < unixepoch()').run()

  fastify.decorate('db', db)

  fastify.addHook('onClose', async () => {
    db.close()
  })
}

export default fp(dbPlugin, { name: 'db-plugin' })
