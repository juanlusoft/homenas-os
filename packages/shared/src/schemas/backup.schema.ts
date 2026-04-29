import { z } from 'zod'

export const BackupJobSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(['rsync', 'tar', 'rclone']),
  source: z.string(),             // source path
  destination: z.string(),        // destination path or remote
  cronExpression: z.string().nullable(),  // null = manual only
  enabled: z.boolean(),
  retentionDays: z.number().nullable(),
  extraArgs: z.array(z.string()),
  lastRun: z.number().nullable(),
  lastStatus: z.enum(['success', 'error', 'running', 'never']),
  lastDuration: z.number().nullable(),  // seconds
  createdAt: z.number(),
})

export const BackupRunSchema = z.object({
  id: z.number(),
  jobId: z.number(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  status: z.enum(['running', 'success', 'error', 'cancelled']),
  exitCode: z.number().nullable(),
  output: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  duration: z.number().nullable(),  // seconds
})

export const CreateBackupJobSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(512).nullable().default(null),
  type: z.enum(['rsync', 'tar', 'rclone']),
  source: z.string().min(1).max(1024)
    .refine(p => !p.includes('..'), { message: 'Path traversal not allowed in source' }),
  destination: z.string().min(1).max(1024)
    .refine(p => !p.includes('..'), { message: 'Path traversal not allowed in destination' }),
  cronExpression: z.string().nullable().default(null),
  enabled: z.boolean().default(true),
  retentionDays: z.number().int().min(1).max(365).nullable().default(null),
  extraArgs: z.array(
    z.string().max(256).refine(a => !a.includes('\0'), { message: 'Null byte not allowed' })
  ).default([]),
})

export const BackupProgressSchema = z.object({
  jobId: z.number().nullable(),
  running: z.boolean(),
  progress: z.number(),
  status: z.string(),
  output: z.array(z.string()),
  error: z.string().nullable(),
})

export type BackupJob = z.infer<typeof BackupJobSchema>
export type BackupRun = z.infer<typeof BackupRunSchema>
export type CreateBackupJobInput = z.infer<typeof CreateBackupJobSchema>
export type BackupProgress = z.infer<typeof BackupProgressSchema>
