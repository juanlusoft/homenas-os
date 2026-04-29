import { z } from 'zod'

export const SystemInfoSchema = z.object({
  hostname: z.string(),
  os: z.string(),
  kernel: z.string(),
  arch: z.string(),
  nodeVersion: z.string(),
  appVersion: z.string(),
  uptime: z.number(),
  timezone: z.string(),
  ipAddresses: z.array(z.string()),
})

export const UpsStatusSchema = z.object({
  connected: z.boolean(),
  model: z.string().nullable(),
  status: z.string().nullable(),
  batteryCharge: z.number().nullable(),
  batteryRuntime: z.number().nullable(),
  inputVoltage: z.number().nullable(),
  outputVoltage: z.number().nullable(),
  loadPercent: z.number().nullable(),
})

export const NotificationSchema = z.object({
  id: z.number(),
  type: z.enum(['info', 'warning', 'error', 'success']),
  title: z.string(),
  message: z.string(),
  read: z.boolean(),
  createdAt: z.number(),
})

export const OtaStatusSchema = z.object({
  currentVersion: z.string(),
  updateAvailable: z.boolean(),
  latestVersion: z.string().nullable(),
  changelog: z.string().nullable(),
  updating: z.boolean(),
  progress: z.number(),
  status: z.string(),
})

export type SystemInfo = z.infer<typeof SystemInfoSchema>
export type UpsStatus = z.infer<typeof UpsStatusSchema>
export type Notification = z.infer<typeof NotificationSchema>
export type OtaStatus = z.infer<typeof OtaStatusSchema>
