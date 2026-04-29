import type { Database } from 'better-sqlite3'

export interface Session {
  id: string
  userId: number
  csrfToken: string
  expiresAt: number
  idleExpiresAt: number
}

interface SessionRow {
  id: string
  user_id: number
  csrf_token: string
  expires_at: number
  idle_expires_at: number | null
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    csrfToken: row.csrf_token,
    expiresAt: row.expires_at,
    idleExpiresAt: row.idle_expires_at ?? 0,
  }
}

export function createSessionsRepo(db: Database) {
  return {
    create(data: { id: string; userId: number; csrfToken: string; expiresAt: number }): void {
      db.prepare(
        `INSERT INTO sessions (id, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)`
      ).run(data.id, data.userId, data.csrfToken, data.expiresAt)
    },

    findById(id: string): Session | undefined {
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined
      return row ? rowToSession(row) : undefined
    },

    delete(id: string): void {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    },

    deleteExpired(): void {
      db.prepare('DELETE FROM sessions WHERE expires_at < unixepoch()').run()
    },

    deleteByUserId(userId: number): void {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
    },

    updateExpiry(id: string, expiresAt: number): void {
      db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expiresAt, id)
    },

    updateIdleExpiry(id: string, idleExpiresAt: number): void {
      db.prepare('UPDATE sessions SET idle_expires_at = ? WHERE id = ?').run(idleExpiresAt, id)
    },
  }
}
