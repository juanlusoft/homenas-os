import { z } from 'zod'

// ─── Device ───────────────────────────────────────────────────────────────────

export const AbDeviceSchema = z.object({
  id: z.number(),
  name: z.string(),
  hostname: z.string().nullable(),
  os_type: z.enum(['windows', 'mac', 'linux']),
  token: z.string(),
  status: z.enum(['pending', 'approved', 'active', 'error', 'offline']),
  last_seen: z.number().nullable(),
  backup_path: z.string().nullable(),
  backup_paths: z.array(z.string()).nullable().optional(),
  schedule_cron: z.string().nullable(),
  retention_days: z.number(),
  created_at: z.number(),
  // Joined fields
  last_run_at: z.number().nullable().optional(),
  last_run_status: z.string().nullable().optional(),
})

export const RegisterDeviceSchema = z.object({
  name: z.string().min(1).max(128),
  hostname: z.string().max(255).nullable().default(null),
  os_type: z.enum(['windows', 'mac', 'linux']).default('linux'),
})

// ─── Backup runs ──────────────────────────────────────────────────────────────

export const AbBackupRunSchema = z.object({
  id: z.number(),
  device_id: z.number(),
  started_at: z.number(),
  finished_at: z.number().nullable(),
  status: z.enum(['running', 'success', 'error', 'cancelled']),
  version: z.string().nullable(),
  size_bytes: z.number().nullable(),
  files_count: z.number().nullable(),
  error_message: z.string().nullable(),
  created_at: z.number(),
})

// ─── Agent poll / report ──────────────────────────────────────────────────────

export const AgentPollResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('waiting') }),
  z.object({
    status: z.literal('backup'),
    run_id: z.number(),
    backup_paths: z.array(z.string()),
    retention_days: z.number(),
  }),
])

export const AgentReportSchema = z.object({
  token: z.string().min(1),
  run_id: z.number().int().positive(),
  status: z.enum(['success', 'error', 'cancelled']),
  size_bytes: z.number().int().nonnegative().nullable().default(null),
  files_count: z.number().int().nonnegative().nullable().default(null),
  error_message: z.string().max(2048).nullable().default(null),
})

// ─── Browse ───────────────────────────────────────────────────────────────────

export const AbFileEntrySchema = z.object({
  name: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number().nullable(),
  modified: z.number().nullable(),
})

// ─── Progress ─────────────────────────────────────────────────────────────────

export const AbProgressSchema = z.object({
  deviceId: z.number().nullable(),
  running: z.boolean(),
  runId: z.number().nullable(),
  progress: z.number(),
  status: z.string(),
  output: z.array(z.string()),
  error: z.string().nullable(),
})

// ─── Push-based backup session ────────────────────────────────────────────────

export const ManifestEntrySchema = z.object({
  path: z.string(),
  hash: z.string().length(64),
  size: z.number().int().nonnegative(),
  mtime: z.number().int(),
})

export const BackupBeginRequestSchema = z.object({
  device_name: z.string().min(1).max(128),
  hostname: z.string().max(255).nullable().default(null),
  os_type: z.enum(['windows', 'mac', 'linux']).default('windows'),
})

export const BackupBeginResponseSchema = z.object({
  session_id: z.string(),
  version: z.string(),
  previous_version: z.string().nullable(),
})

export const FileCheckRequestSchema = z.object({
  session_id: z.string(),
  files: z.array(ManifestEntrySchema),
})

export const FileCheckResponseSchema = z.object({
  already_have: z.array(z.string()),
})

export const BackupEndRequestSchema = z.object({
  session_id: z.string(),
  files_count: z.number().int().nonnegative(),
  size_bytes: z.number().int().nonnegative(),
  status: z.enum(['success', 'error']),
  error_message: z.string().nullable().default(null),
})

// ─── Device update ────────────────────────────────────────────────────────────

export const UpdateDeviceSchema = z.object({
  hostname: z.string().max(255).nullable().optional(),
  backup_paths: z.array(z.string()).optional(),
  schedule_cron: z.string().nullable().optional(),
  retention_days: z.number().int().positive().optional(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type ManifestEntry = z.infer<typeof ManifestEntrySchema>
export type BackupBeginRequest = z.infer<typeof BackupBeginRequestSchema>
export type BackupBeginResponse = z.infer<typeof BackupBeginResponseSchema>
export type FileCheckRequest = z.infer<typeof FileCheckRequestSchema>
export type FileCheckResponse = z.infer<typeof FileCheckResponseSchema>
export type BackupEndRequest = z.infer<typeof BackupEndRequestSchema>
export type UpdateDeviceInput = z.infer<typeof UpdateDeviceSchema>

export type AbDevice = z.infer<typeof AbDeviceSchema>
export type RegisterDeviceInput = z.infer<typeof RegisterDeviceSchema>
export type AbBackupRun = z.infer<typeof AbBackupRunSchema>
export type AgentPollResponse = z.infer<typeof AgentPollResponseSchema>
export type AgentReportInput = z.infer<typeof AgentReportSchema>
export type AbFileEntry = z.infer<typeof AbFileEntrySchema>
export type AbProgress = z.infer<typeof AbProgressSchema>
