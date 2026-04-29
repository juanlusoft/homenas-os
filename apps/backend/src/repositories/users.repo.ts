import type { Database } from 'better-sqlite3'

export interface User {
  id: number
  username: string
  passwordHash: string
  role: 'admin' | 'user'
  totpSecret: string | null
  totpEnabled: boolean
  createdAt: number
}

interface UserRow {
  id: number
  username: string
  password_hash: string
  role: 'admin' | 'user'
  totp_secret: string | null
  totp_enabled: number
  created_at: number
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    totpSecret: row.totp_secret ?? null,
    totpEnabled: row.totp_enabled === 1,
    createdAt: row.created_at,
  }
}

export function createUsersRepo(db: Database) {
  return {
    findByUsername(username: string): User | undefined {
      const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined
      return row ? rowToUser(row) : undefined
    },

    findFirstAdmin(): User | undefined {
      const row = db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get() as UserRow | undefined
      return row ? rowToUser(row) : undefined
    },

    findById(id: number): User | undefined {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
      return row ? rowToUser(row) : undefined
    },

    create(data: { username: string; passwordHash: string; role: 'admin' | 'user' }): User {
      const result = db.prepare(
        `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`
      ).run(data.username, data.passwordHash, data.role)
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as UserRow
      return rowToUser(row)
    },

    updatePassword(id: number, passwordHash: string): void {
      db.prepare(
        `UPDATE users SET password_hash = ?, updated_at = unixepoch() WHERE id = ?`
      ).run(passwordHash, id)
    },

    updateUsername(id: number, username: string): void {
      db.prepare(
        `UPDATE users SET username = ?, updated_at = unixepoch() WHERE id = ?`
      ).run(username, id)
    },

    list(): User[] {
      const rows = db.prepare('SELECT * FROM users ORDER BY id').all() as UserRow[]
      return rows.map(rowToUser)
    },

    delete(id: number): void {
      db.prepare('DELETE FROM users WHERE id = ?').run(id)
    },

    setTotpSecret(id: number, secret: string): void {
      db.prepare('UPDATE users SET totp_secret = ?, updated_at = unixepoch() WHERE id = ?').run(secret, id)
    },

    enableTotp(id: number): void {
      db.prepare('UPDATE users SET totp_enabled = 1, updated_at = unixepoch() WHERE id = ?').run(id)
    },

    disableTotp(id: number): void {
      db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, updated_at = unixepoch() WHERE id = ?').run(id)
    },
  }
}
