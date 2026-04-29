import type { Database } from 'better-sqlite3'

export function getSetting(db: Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(db: Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())').run(key, value)
}

export function deleteSetting(db: Database, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}
