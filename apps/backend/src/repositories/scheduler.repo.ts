import type { Database } from 'better-sqlite3'

export interface TaskRow {
  id: number
  name: string
  description: string | null
  cron_expression: string
  command: string
  args: string // JSON array
  enabled: number
  last_run: number | null
  last_exit_code: number | null
  last_output: string | null
  created_at: number
}

export interface TaskRecord {
  id: number
  name: string
  description: string | null
  cronExpression: string
  command: string
  args: string[]
  enabled: boolean
  lastRun: number | null
  lastExitCode: number | null
  lastOutput: string | null
  createdAt: number
}

function rowToTask(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cronExpression: row.cron_expression,
    command: row.command,
    args: JSON.parse(row.args) as string[],
    enabled: row.enabled === 1,
    lastRun: row.last_run,
    lastExitCode: row.last_exit_code,
    lastOutput: row.last_output,
    createdAt: row.created_at,
  }
}

export function createSchedulerRepo(db: Database) {
  return {
    list(): TaskRecord[] {
      const rows = db.prepare('SELECT * FROM scheduled_tasks ORDER BY id').all() as TaskRow[]
      return rows.map(rowToTask)
    },

    findById(id: number): TaskRecord | undefined {
      const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as TaskRow | undefined
      return row ? rowToTask(row) : undefined
    },

    create(data: {
      name: string
      description: string | null
      cronExpression: string
      command: string
      args: string[]
      enabled: boolean
    }): TaskRecord {
      const result = db.prepare(
        `INSERT INTO scheduled_tasks (name, description, cron_expression, command, args, enabled)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        data.name,
        data.description,
        data.cronExpression,
        data.command,
        JSON.stringify(data.args),
        data.enabled ? 1 : 0
      )
      const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(result.lastInsertRowid) as TaskRow
      return rowToTask(row)
    },

    update(id: number, data: Partial<{
      name: string
      description: string | null
      cronExpression: string
      command: string
      args: string[]
      enabled: boolean
    }>): TaskRecord | undefined {
      const fields: string[] = []
      const values: unknown[] = []

      if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
      if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
      if (data.cronExpression !== undefined) { fields.push('cron_expression = ?'); values.push(data.cronExpression) }
      if (data.command !== undefined) { fields.push('command = ?'); values.push(data.command) }
      if (data.args !== undefined) { fields.push('args = ?'); values.push(JSON.stringify(data.args)) }
      if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0) }

      if (fields.length === 0) return this.findById(id)

      values.push(id)
      db.prepare(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values)
      return this.findById(id)
    },

    setEnabled(id: number, enabled: boolean): void {
      db.prepare('UPDATE scheduled_tasks SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
    },

    updateRunResult(id: number, lastRun: number, lastExitCode: number, lastOutput: string): void {
      db.prepare(
        `UPDATE scheduled_tasks SET last_run = ?, last_exit_code = ?, last_output = ? WHERE id = ?`
      ).run(lastRun, lastExitCode, lastOutput, id)
    },

    delete(id: number): void {
      db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id)
    },
  }
}
