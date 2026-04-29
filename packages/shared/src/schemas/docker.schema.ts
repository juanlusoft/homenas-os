import { z } from 'zod'

export const ContainerSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  status: z.string(),         // e.g. "running", "exited", "paused"
  state: z.string(),          // Docker state string
  created: z.number(),        // unix timestamp
  ports: z.array(z.object({
    hostPort: z.number().nullable(),
    containerPort: z.number(),
    protocol: z.string(),
  })),
  cpuPercent: z.number().nullable(),
  memUsageBytes: z.number().nullable(),
  memLimitBytes: z.number().nullable(),
  envVars: z.array(z.string()).default([]),
})

export const ContainerActionSchema = z.object({
  containerId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  action: z.enum(['start', 'stop', 'restart', 'pause', 'unpause', 'remove']),
})

export const ComposeStackSchema = z.object({
  name: z.string(),
  path: z.string(),           // directory with docker-compose.yml
  status: z.enum(['running', 'partial', 'stopped', 'unknown']),
  services: z.array(z.string()),
  containerCount: z.number(),
  runningCount: z.number(),
})

export const ComposeActionSchema = z.object({
  path: z.string()
    .min(1)
    .max(512)
    .refine(p => !p.includes('..'), { message: 'Path traversal not allowed' })
    .refine(p => p.startsWith('/opt/stacks/') || p === '/opt/stacks', { message: 'Path must be within /opt/stacks' }),
  action: z.enum(['up', 'down', 'pull', 'restart']),
})

export const ComposeProgressSchema = z.object({
  running: z.boolean(),
  action: z.string(),
  output: z.array(z.string()),
  error: z.string().nullable(),
})

export type Container = z.infer<typeof ContainerSchema>
export type ContainerAction = z.infer<typeof ContainerActionSchema>
export type ComposeStack = z.infer<typeof ComposeStackSchema>
export type ComposeAction = z.infer<typeof ComposeActionSchema>
export type ComposeProgress = z.infer<typeof ComposeProgressSchema>
