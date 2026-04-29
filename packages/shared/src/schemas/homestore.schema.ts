import { z } from 'zod'

// ─── App Status ───────────────────────────────────────────────────────────────

export const AppStatusSchema = z.enum([
  'notInstalled',
  'installing',
  'running',
  'stopped',
  'error',
  'updating',
])

// ─── App Category ─────────────────────────────────────────────────────────────

export const AppCategorySchema = z.enum([
  'Media',
  'Networking',
  'Monitoring',
  'Development',
  'Storage',
  'Automation',
  'Security',
  'Download',
])

// ─── Port mapping ─────────────────────────────────────────────────────────────

export const PortMappingSchema = z.object({
  hostPort: z.number().int().min(1).max(65535),
  containerPort: z.number().int().min(1).max(65535),
  protocol: z.enum(['tcp', 'udp']).default('tcp'),
  label: z.string().optional(),
})

// ─── Volume mapping ───────────────────────────────────────────────────────────

export const VolumeMappingSchema = z.object({
  hostPath: z.string().min(1),
  containerPath: z.string().min(1),
  label: z.string().optional(),
})

// ─── Env var ─────────────────────────────────────────────────────────────────

export const EnvVarSchema = z.object({
  key: z.string().min(1).max(256),
  value: z.string().max(2048),
  label: z.string().optional(),
  secret: z.boolean().default(false).optional(),
})

// ─── App Catalog Entry (returned to frontend) ─────────────────────────────────

export const CatalogAppSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/).min(1).max(64),
  name: z.string(),
  description: z.string(),
  icon: z.string(),           // emoji or URL
  category: AppCategorySchema,
  dockerImage: z.string(),
  defaultPorts: z.array(PortMappingSchema),
  defaultVolumes: z.array(VolumeMappingSchema),
  defaultEnvVars: z.array(EnvVarSchema),
  status: AppStatusSchema,
  containerId: z.string().nullable(),    // null if not installed
  containerName: z.string().nullable(),
  installedAt: z.number().nullable(),    // unix timestamp
  webUrl: z.string().nullable(),         // e.g. http://nas:8096
})

// ─── App Config (persisted on disk) ──────────────────────────────────────────

export const AppConfigSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  dockerImage: z.string(),
  ports: z.array(PortMappingSchema),
  volumes: z.array(VolumeMappingSchema),
  envVars: z.array(EnvVarSchema),
  containerId: z.string().nullable(),
  containerName: z.string(),
  installedAt: z.number(),
  restartPolicy: z.enum(['no', 'always', 'unless-stopped', 'on-failure']).default('unless-stopped'),
  extraArgs: z.array(z.string()).default([]),
})

// ─── Install Payload ──────────────────────────────────────────────────────────

export const InstallPayloadSchema = z.object({
  ports: z.array(PortMappingSchema).optional(),
  volumes: z.array(VolumeMappingSchema).optional(),
  envVars: z.array(EnvVarSchema).optional(),
  restartPolicy: z.enum(['no', 'always', 'unless-stopped', 'on-failure']).optional().default('unless-stopped'),
  extraArgs: z.array(
    z.string().max(256).refine(a => !a.includes('\0') && !a.includes('\n'), { message: 'Invalid arg' })
  ).optional().default([]),
})

// ─── Uninstall Payload ────────────────────────────────────────────────────────

export const UninstallPayloadSchema = z.object({
  removeData: z.boolean().default(false),
})

// ─── App Logs Response ────────────────────────────────────────────────────────

export const AppLogsResponseSchema = z.object({
  id: z.string(),
  logs: z.string(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppStatus = z.infer<typeof AppStatusSchema>
export type AppCategory = z.infer<typeof AppCategorySchema>
export type PortMapping = z.infer<typeof PortMappingSchema>
export type VolumeMapping = z.infer<typeof VolumeMappingSchema>
export type EnvVar = z.infer<typeof EnvVarSchema>
export type CatalogApp = z.infer<typeof CatalogAppSchema>
export type AppConfig = z.infer<typeof AppConfigSchema>
export type InstallPayload = z.infer<typeof InstallPayloadSchema>
export type UninstallPayload = z.infer<typeof UninstallPayloadSchema>
export type AppLogsResponse = z.infer<typeof AppLogsResponseSchema>
