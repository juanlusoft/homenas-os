import { execa, type Subprocess } from 'execa'
import type { Database } from 'better-sqlite3'
import { createBackupRepo } from '../repositories/backup.repo.js'
import type { BackupJob, BackupProgress, BackupRun, CreateBackupJobInput } from '@homenas/shared'

// ─── extraArgs safety ─────────────────────────────────────────────────────────

// Flags that allow arbitrary command execution — must never be passed through
const RSYNC_BLOCKED_PREFIXES = ['-e', '--rsh', '--rsync-path', '--copy-dest', '--compare-dest', '--remote-option']
const TAR_BLOCKED_PREFIXES = ['--use-compress-program', '-I', '--to-command', '--checkpoint-action']

function validateExtraArgs(type: CreateBackupJobInput['type'], args: string[]): void {
  const blockedPrefixes = type === 'rsync' ? RSYNC_BLOCKED_PREFIXES
    : type === 'tar' ? TAR_BLOCKED_PREFIXES
    : [] // rclone has no known RCE vectors via args when shell:false

  for (const arg of args) {
    for (const blocked of blockedPrefixes) {
      if (arg === blocked || arg.startsWith(`${blocked}=`) || arg.startsWith(`${blocked} `)) {
        throw new Error(`Argument not allowed: ${blocked}`)
      }
    }
    // Guard against argument injection via null bytes
    if (arg.includes('\0')) {
      throw new Error('Null byte not allowed in extra arguments')
    }
  }
}

interface RunningJob {
  jobId: number
  runId: number
  output: string[]
  startedAt: number
  process: Subprocess
}

// Module-level state — one backup at a time
let runningJob: RunningJob | null = null

export function createBackupService(db: Database) {
  const repo = createBackupRepo(db)

  return {
    listJobs(): BackupJob[] {
      return repo.listJobs()
    },

    createJob(input: CreateBackupJobInput): BackupJob {
      return repo.createJob(input)
    },

    updateJob(id: number, input: Partial<CreateBackupJobInput>): BackupJob {
      const existing = repo.getJob(id)
      if (!existing) throw new Error('Job not found')
      return repo.updateJob(id, input)
    },

    deleteJob(id: number): void {
      const existing = repo.getJob(id)
      if (!existing) throw new Error('Job not found')
      // Cancel if this job is currently running
      if (runningJob && runningJob.jobId === id) {
        try { runningJob.process.kill() } catch { /* ignore */ }
        runningJob = null
      }
      repo.deleteJob(id)
    },

    runJob(jobId: number): { started: true } {
      if (runningJob) {
        throw new Error('Another backup job is already running')
      }

      const job = repo.getJob(jobId)
      if (!job) throw new Error('Job not found')

      // Validate extraArgs before building the command — prevents RCE via rsync -e / tar --use-compress-program
      validateExtraArgs(job.type, job.extraArgs)

      const run = repo.createRun(jobId)
      const startedAt = Math.floor(Date.now() / 1000)

      // Build command args based on type
      let command: string
      let args: string[]

      switch (job.type) {
        case 'rsync':
          command = 'rsync'
          args = ['-av', '--progress', ...job.extraArgs, job.source, job.destination]
          break
        case 'tar':
          command = 'tar'
          args = ['-czf', job.destination, ...job.extraArgs, job.source]
          break
        case 'rclone':
          command = 'rclone'
          args = ['sync', ...job.extraArgs, job.source, job.destination]
          break
        default:
          throw new Error(`Unknown job type: ${job.type as string}`)
      }

      // Update job status to running
      repo.updateJobStatus(jobId, 'running', startedAt)

      // Spawn process — NEVER use shell: true
      const proc = execa(command, args, {
        shell: false,
        reject: false,
        all: true,
      })

      const outputLines: string[] = []

      runningJob = {
        jobId,
        runId: run.id,
        output: outputLines,
        startedAt,
        process: proc,
      }

      // Capture output line-by-line
      if (proc.all) {
        proc.all.on('data', (chunk: Buffer | string) => {
          const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
          const lines = text.split('\n')
          for (const line of lines) {
            const trimmed = line.trimEnd()
            if (trimmed) {
              outputLines.push(trimmed)
              // Keep last 1000 lines in memory
              if (outputLines.length > 1000) outputLines.shift()
            }
          }
        })
      }

      // Handle completion
      void proc.then((result) => {
        const finishedAt = Math.floor(Date.now() / 1000)
        const duration = finishedAt - startedAt
        const exitCode = result.exitCode ?? 0
        const status: BackupRun['status'] = exitCode === 0 ? 'success' : 'error'
        const fullOutput = outputLines.join('\n')

        repo.finishRun(run.id, {
          status,
          exitCode,
          output: fullOutput.slice(0, 65535),
          duration,
        })

        repo.updateJobStatus(jobId, status === 'success' ? 'success' : 'error', startedAt, duration)

        runningJob = null
      })

      return { started: true }
    },

    getProgress(): BackupProgress {
      if (!runningJob) {
        return {
          jobId: null,
          running: false,
          progress: 0,
          status: 'idle',
          output: [],
          error: null,
        }
      }

      const { jobId, output } = runningJob

      // Try to parse rsync progress percentage from output
      let progress = 0
      for (let i = output.length - 1; i >= 0; i--) {
        const match = output[i].match(/(\d+)%/)
        if (match) {
          progress = parseInt(match[1], 10)
          break
        }
      }

      const last20 = output.slice(-20)

      return {
        jobId,
        running: true,
        progress,
        status: 'running',
        output: last20,
        error: null,
      }
    },

    getHistory(jobId: number): BackupRun[] {
      return repo.listRuns(jobId, 20)
    },

    cancelJob(): void {
      if (!runningJob) throw new Error('No job is currently running')

      const { jobId, runId, startedAt, process: proc } = runningJob

      try {
        proc.kill('SIGTERM')
      } catch {
        // ignore kill errors
      }

      const finishedAt = Math.floor(Date.now() / 1000)
      const duration = finishedAt - startedAt

      repo.finishRun(runId, {
        status: 'cancelled',
        exitCode: -1,
        duration,
      })

      repo.updateJobStatus(jobId, 'error', startedAt, duration)

      runningJob = null
    },
  }
}
