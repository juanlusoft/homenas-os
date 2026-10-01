import { validate } from 'node-cron'

export function validateBackupCron(expression: unknown): void {
  if (expression === null || expression === undefined) return // manual-only
  if (typeof expression !== 'string' || !expression.trim() || !validate(expression)) {
    throw new Error('Invalid backup cron expression')
  }
}
