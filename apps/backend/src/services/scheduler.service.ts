import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as nodeCron from 'node-cron'
import { type ScheduledTask as CronJob } from 'node-cron'
import type { Database } from 'better-sqlite3'
import { createSchedulerRepo } from '../repositories/scheduler.repo.js'
import type { CreateTaskInput, UpdateTaskInput, ScheduledTask } from '@homenas/shared'

const execFileAsync = promisify(execFile)

// Map of task id → scheduled cron job
const activeJobs = new Map<number, CronJob>()

function computeNextRun(cronExpression: string): number | null {
  // Use node-cron to validate and get next run (approximate: add 1 minute from now and check)
  try {
    if (!nodeCron.validate(cronExpression)) return null
    // node-cron doesn't expose a "next run" API — approximate by adding ~60s
    // For production you'd use a cron-parser library, but this is a simple approximation
    return Math.floor(Date.now() / 1000) + 60
  } catch {
    return null
  }
}

function toScheduledTask(record: ReturnType<ReturnType<typeof createSchedulerRepo>['findById']> & object, cronExpression: string): ScheduledTask {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    cronExpression: record.cronExpression,
    command: record.command,
    args: record.args,
    enabled: record.enabled,
    lastRun: record.lastRun,
    lastExitCode: record.lastExitCode,
    lastOutput: record.lastOutput,
    nextRun: record.enabled ? computeNextRun(cronExpression) : null,
    createdAt: record.createdAt,
  }
}

export function createSchedulerService(db: Database) {
  const repo = createSchedulerRepo(db)

  function scheduleTask(taskId: number, cronExpression: string, command: string, args: string[]) {
    // Cancel existing job if any
    const existing = activeJobs.get(taskId)
    if (existing) {
      existing.stop()
      activeJobs.delete(taskId)
    }

    if (!nodeCron.validate(cronExpression)) return

    const job = nodeCron.schedule(cronExpression, async () => {
      const startTime = Math.floor(Date.now() / 1000)
      try {
        const { stdout, stderr } = await execFileAsync(command, args, {
          timeout: 5 * 60 * 1000, // 5 minute timeout
          maxBuffer: 1024 * 1024,  // 1MB output limit
        })
        const output = (stdout + stderr).slice(0, 65535)
        repo.updateRunResult(taskId, startTime, 0, output)
      } catch (err: unknown) {
        const exitCode = (err as NodeJS.ErrnoException & { code?: number }).code ?? 1
        const output = ((err as { stdout?: string }).stdout ?? '') + ((err as { stderr?: string }).stderr ?? '')
        repo.updateRunResult(taskId, startTime, typeof exitCode === 'number' ? exitCode : 1, output.slice(0, 65535))
      }
    })

    activeJobs.set(taskId, job)
  }

  function unscheduleTask(taskId: number) {
    const job = activeJobs.get(taskId)
    if (job) {
      job.stop()
      activeJobs.delete(taskId)
    }
  }

  function recordToTask(record: NonNullable<ReturnType<ReturnType<typeof createSchedulerRepo>['findById']>>): ScheduledTask {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      cronExpression: record.cronExpression,
      command: record.command,
      args: record.args,
      enabled: record.enabled,
      lastRun: record.lastRun,
      lastExitCode: record.lastExitCode,
      lastOutput: record.lastOutput,
      nextRun: record.enabled ? computeNextRun(record.cronExpression) : null,
      createdAt: record.createdAt,
    }
  }

  return {
    /** Load all enabled tasks from DB and schedule them. Call on startup. */
    initialize() {
      const tasks = repo.list()
      for (const task of tasks) {
        if (task.enabled) {
          scheduleTask(task.id, task.cronExpression, task.command, task.args)
        }
      }
    },

    listTasks(): ScheduledTask[] {
      return repo.list().map(recordToTask)
    },

    createTask(input: CreateTaskInput): ScheduledTask {
      const record = repo.create({
        name: input.name,
        description: input.description,
        cronExpression: input.cronExpression,
        command: input.command,
        args: input.args,
        enabled: input.enabled,
      })

      if (record.enabled) {
        scheduleTask(record.id, record.cronExpression, record.command, record.args)
      }

      return recordToTask(record)
    },

    updateTask(id: number, input: UpdateTaskInput): ScheduledTask {
      const existing = repo.findById(id)
      if (!existing) throw new Error('Task not found')

      const updated = repo.update(id, {
        name: input.name,
        description: input.description,
        cronExpression: input.cronExpression,
        command: input.command,
        args: input.args,
        enabled: input.enabled,
      })

      if (!updated) throw new Error('Task not found after update')

      // Re-schedule with new settings
      unscheduleTask(id)
      if (updated.enabled) {
        scheduleTask(updated.id, updated.cronExpression, updated.command, updated.args)
      }

      return recordToTask(updated)
    },

    deleteTask(id: number): void {
      const existing = repo.findById(id)
      if (!existing) throw new Error('Task not found')
      unscheduleTask(id)
      repo.delete(id)
    },

    toggleTask(id: number): ScheduledTask {
      const existing = repo.findById(id)
      if (!existing) throw new Error('Task not found')

      const newEnabled = !existing.enabled
      repo.setEnabled(id, newEnabled)

      if (newEnabled) {
        scheduleTask(id, existing.cronExpression, existing.command, existing.args)
      } else {
        unscheduleTask(id)
      }

      const updated = repo.findById(id)!
      return recordToTask(updated)
    },

    async runNow(id: number): Promise<ScheduledTask> {
      const task = repo.findById(id)
      if (!task) throw new Error('Task not found')

      const startTime = Math.floor(Date.now() / 1000)
      try {
        const { stdout, stderr } = await execFileAsync(task.command, task.args, {
          timeout: 5 * 60 * 1000,
          maxBuffer: 1024 * 1024,
        })
        const output = (stdout + stderr).slice(0, 65535)
        repo.updateRunResult(id, startTime, 0, output)
      } catch (err: unknown) {
        const exitCode = (err as NodeJS.ErrnoException & { code?: number }).code ?? 1
        const output = ((err as { stdout?: string }).stdout ?? '') + ((err as { stderr?: string }).stderr ?? '')
        repo.updateRunResult(id, startTime, typeof exitCode === 'number' ? exitCode : 1, output.slice(0, 65535))
      }

      const updated = repo.findById(id)!
      return recordToTask(updated)
    },

    shutdown() {
      for (const [, job] of activeJobs) {
        job.stop()
      }
      activeJobs.clear()
    },
  }
}
