import { z } from 'zod'

// Basic cron expression validation: 5 fields (min hour dom month dow), optionally 6 (with seconds)
const CRON_REGEX = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/

export const ScheduledTaskSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  cronExpression: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  enabled: z.boolean(),
  lastRun: z.number().nullable(),
  lastExitCode: z.number().nullable(),
  lastOutput: z.string().nullable(),
  nextRun: z.number().nullable(),
  createdAt: z.number(),
})

export const CreateTaskSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(512).nullable().default(null),
  cronExpression: z.string().min(1).refine(
    (val) => CRON_REGEX.test(val),
    { message: 'Invalid cron expression (expected 5-field format: min hour dom month dow)' }
  ),
  command: z.string()
    .min(1)
    .max(512)
    .refine(cmd => !cmd.includes('..'), { message: 'Path traversal not allowed in command' })
    .refine(cmd => /^[a-zA-Z0-9/_.\\-]+$/.test(cmd), { message: 'Command contains invalid characters' }),
  args: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
})

export const UpdateTaskSchema = CreateTaskSchema.partial()

export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>
