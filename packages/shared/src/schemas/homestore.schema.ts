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
  // 'rw' | 'ro' — emitted to docker as `:ro` when read-only. Defaulted so old
  // catalog defaults and persisted configs without this field stay valid.
  mode: z.enum(['rw', 'ro']).default('rw').optional(),
  label: z.string().optional(),
})

// ─── Env var ─────────────────────────────────────────────────────────────────

export const EnvVarSchema = z.object({
  key: z.string().min(1).max(256),
  value: z.string().max(2048),
  label: z.string().optional(),
  secret: z.boolean().default(false).optional(),
})

// ─── Resource limits ──────────────────────────────────────────────────────────
// Mirrors `docker run --cpus` / `--memory` flags. Values are passed through as
// strings (e.g. "1.5", "512m", "2g") because Docker accepts unit suffixes.

export const ResourceLimitsSchema = z.object({
  // Number of CPUs as a string, e.g. "0.5", "1", "2.5". Empty string = unset.
  cpus: z
    .string()
    .max(16)
    .regex(/^[0-9]*\.?[0-9]+$/, { message: 'cpus must be a positive number (e.g. "0.5", "2")' })
    .optional(),
  // Memory limit. Accepts integers and decimals with optional unit suffix
  // (b, k, kb, m, mb, g, gb, case-insensitive). E.g. "512m", "1.5g", "256mb", "1024".
  memory: z
    .string()
    .max(16)
    .regex(/^\d+(\.\d+)?\s*(b|k|kb|m|mb|g|gb)?$/i, { message: 'memory must be like "512m", "1.5g", "256mb", or a byte count' })
    .optional(),
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
  resources: ResourceLimitsSchema.optional(),
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
  resources: ResourceLimitsSchema.optional(),
})

// ─── Edit Payload ─────────────────────────────────────────────────────────────
// All fields optional — only provided fields are merged onto the current config.
// `null` is *not* accepted: omit a field to keep its current value. To clear a
// resource limit explicitly, send `resources: { cpus: '', memory: '' }` (empty
// strings collapse to "unset" inside the service).

export const EditPayloadSchema = z
  .object({
    dockerImage: z.string().min(1).max(512).optional(),
    ports: z.array(PortMappingSchema).optional(),
    volumes: z.array(VolumeMappingSchema).optional(),
    envVars: z.array(EnvVarSchema).optional(),
    restartPolicy: z.enum(['no', 'always', 'unless-stopped', 'on-failure']).optional(),
    extraArgs: z
      .array(
        z.string().max(256).refine(a => !a.includes('\0') && !a.includes('\n'), { message: 'Invalid arg' })
      )
      .optional(),
    resources: ResourceLimitsSchema.optional(),
  })
  .strict()
  .refine(
    (obj) => Object.keys(obj).length > 0,
    { message: 'Edit payload must contain at least one field' },
  )

// ─── Effective Container Config ──────────────────────────────────────────────
// Snapshot of the *currently persisted* config for an installed HomeStore app.
// Returned by GET /api/containers/:id/config so the edit modal can prefill
// fields with what the user actually has running, not the catalog defaults.
//
// This intentionally mirrors the runtime-relevant subset of `AppConfigSchema`:
// metadata fields like `containerId`, `containerName`, `installedAt` are
// excluded — the edit form has no use for them, and exposing them only
// widens the surface area we have to keep stable.

export const EffectiveContainerConfigSchema = z.object({
  dockerImage: z.string(),
  ports: z.array(PortMappingSchema),
  volumes: z.array(VolumeMappingSchema),
  envVars: z.array(EnvVarSchema),
  restartPolicy: z.enum(['no', 'always', 'unless-stopped', 'on-failure']),
  extraArgs: z.array(z.string()),
  resources: ResourceLimitsSchema.optional(),
})

// ─── Edit Response ────────────────────────────────────────────────────────────
// The route always returns HTTP 200 with this body when the request was
// processed end-to-end (even when rollback fired). A non-2xx response means the
// request failed *before* anything was applied (validation / not installed).

export const EditResponseSchema = z.discriminatedUnion('ok', [
  // Happy paths: no diff (recreated:false) or successful recreate (recreated:true).
  z.object({
    ok: z.literal(true),
    recreated: z.boolean(),
    container: z.lazy(() => CatalogAppSchema),
  }),
  // Rollback path: the new run failed and we restored the previous config.
  z.object({
    ok: z.literal(false),
    error: z.string(),
    rolledBack: z.boolean(),
    container: z.lazy(() => CatalogAppSchema),
  }),
])

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
export type ResourceLimits = z.infer<typeof ResourceLimitsSchema>
export type CatalogApp = z.infer<typeof CatalogAppSchema>
export type AppConfig = z.infer<typeof AppConfigSchema>
export type InstallPayload = z.infer<typeof InstallPayloadSchema>
export type EditPayload = z.infer<typeof EditPayloadSchema>
export type EditResponse = z.infer<typeof EditResponseSchema>
export type EffectiveContainerConfig = z.infer<typeof EffectiveContainerConfigSchema>
export type UninstallPayload = z.infer<typeof UninstallPayloadSchema>
export type AppLogsResponse = z.infer<typeof AppLogsResponseSchema>
