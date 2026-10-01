import * as cron from 'node-cron'
import type { Database } from 'better-sqlite3'
import { createBackupService } from './backup.service.js'
import { createCloudBackupService } from './cloud-backup.service.js'
import { logError } from '../lib/log-store.js'

export type BackupKind = 'local' | 'cloud'
interface JobRow { id: number; enabled: number; cron_expression: string | null }
interface Timer { destroy(): void | Promise<void> }
export interface BackupSchedulerDependencies {
  schedule: (expression: string, callback: () => Promise<void>) => Timer
  runJob: (kind: BackupKind, id: number) => unknown | Promise<unknown>
  isRunning: (kind: BackupKind) => boolean
  cancelRunning: () => void
  onError: (error: unknown, kind: BackupKind, id: number) => void
}
interface Entry { kind: BackupKind; id: number; expression: string; timer: Timer }
const schedulers = new WeakMap<Database, ReturnType<typeof createBackupScheduler>>()
const tables = { local: 'backup_jobs', cloud: 'cloud_backup_jobs' } as const

/** Single-process timers; execution/persistence use the same runners as manual backups. */
export function createBackupScheduler(db: Database, overrides: Partial<BackupSchedulerDependencies> = {}) {
  const local = createBackupService(db)
  const cloud = createCloudBackupService(db)
  const dependencies: BackupSchedulerDependencies = {
    schedule: (expression, callback) => cron.schedule(expression, callback, { noOverlap: true }),
    runJob: (kind, id) => kind === 'local' ? local.runJob(id) : cloud.startTransfer(id),
    isRunning: kind => kind === 'local' ? local.getProgress().running : cloud.getTransferProgress().running,
    cancelRunning: () => {
      if (local.getProgress().running) local.cancelJob()
      if (cloud.getTransferProgress().running) cloud.cancelTransfer()
    },
    onError: (error, kind, id) => logError('backup-scheduler', error instanceof Error ? error.message : String(error), { kind, jobId: id }),
    ...overrides,
  }
  const entries = new Map<string, Entry>()
  const launching = new Set<BackupKind>()
  const pending = new Set<Promise<void>>()
  const destroying = new Set<Promise<void>>()
  let initialized = false
  let stopped = false

  function destroy(entry: Entry) {
    const promise = Promise.resolve().then(() => entry.timer.destroy())
      .catch(error => dependencies.onError(error, entry.kind, entry.id))
      .finally(() => destroying.delete(promise))
    destroying.add(promise)
  }

  function refresh() {
    if (!initialized || stopped) return
    const desired = new Set<string>()
    for (const kind of ['local', 'cloud'] as const) {
      const rows = db.prepare(`SELECT id, enabled, cron_expression FROM ${tables[kind]}`).all() as JobRow[]
      for (const row of rows) {
        if (row.enabled !== 1 || row.cron_expression === null) continue
        if (!cron.validate(row.cron_expression)) {
          dependencies.onError(new Error('Ignoring stored invalid backup cron expression'), kind, row.id)
          continue
        }
        const key = `${kind}:${row.id}`
        desired.add(key)
        const previous = entries.get(key)
        if (previous?.expression === row.cron_expression) continue
        if (previous) { entries.delete(key); destroy(previous) }
        const entry: Entry = { kind, id: row.id, expression: row.cron_expression, timer: null as unknown as Timer }
        const callback = async () => {
          if (stopped || entries.get(key) !== entry) return
          if (launching.has(kind)) {
            dependencies.onError(new Error('Scheduled backup skipped: another backup launch is in progress'), kind, row.id)
            return
          }
          // Re-read before launching: a stale timer must not execute a disabled/deleted/changed job.
          const current = db.prepare(`SELECT enabled, cron_expression FROM ${tables[kind]} WHERE id = ?`).get(row.id) as JobRow | undefined
          if (!current || current.enabled !== 1 || current.cron_expression !== entry.expression) return
          if (dependencies.isRunning(kind)) {
            dependencies.onError(new Error('Scheduled backup skipped: another backup is already running'), kind, row.id)
            return
          }
          launching.add(kind)
          const execution = Promise.resolve().then(() => stopped ? undefined : dependencies.runJob(kind, row.id))
            .then(() => undefined)
            .catch(error => dependencies.onError(error, kind, row.id))
            .finally(() => { launching.delete(kind); pending.delete(execution) })
          pending.add(execution)
          await execution
        }
        entry.timer = dependencies.schedule(entry.expression, async () => {
          try { await callback() } catch (error) { dependencies.onError(error, kind, row.id) }
        })
        entries.set(key, entry)
      }
    }
    for (const [key, entry] of entries) {
      if (!desired.has(key)) { entries.delete(key); destroy(entry) }
    }
  }

  return {
    initialize() {
      if (stopped) throw new Error('Backup scheduler has been shut down')
      if (initialized) return
      if (schedulers.has(db)) throw new Error('A backup scheduler is already initialized for this database')
      initialized = true
      schedulers.set(db, this)
      refresh()
    },
    refresh,
    async shutdown() {
      if (stopped) return
      stopped = true
      schedulers.delete(db)
      for (const entry of entries.values()) destroy(entry)
      entries.clear()
      await Promise.all([...pending, ...destroying])
      dependencies.cancelRunning()
    },
  }
}

export function refreshBackupSchedules(db: Database): void {
  schedulers.get(db)?.refresh()
}

export async function shutdownBackupSchedules(db: Database): Promise<void> {
  await schedulers.get(db)?.shutdown()
}
