import { z } from 'zod'

export const SystemMetricsSchema = z.object({
  cpu: z.object({
    usagePercent: z.number(),
    tempCelsius: z.number().nullable(),
    cores: z.number(),
    model: z.string().nullable().optional(),
    physicalCores: z.number().nullable().optional(),
    speedGhz: z.number().nullable().optional(),
    coreLoads: z.array(z.number()).optional(),
  }),
  memory: z.object({
    totalBytes: z.number(),
    usedBytes: z.number(),
    freeBytes: z.number(),
    usagePercent: z.number(),
    swapTotalBytes: z.number().nullable().optional(),
    swapUsedBytes: z.number().nullable().optional(),
  }),
  network: z.object({
    interface: z.string(),
    rxBytesPerSec: z.number(),
    txBytesPerSec: z.number(),
    rxTotal: z.number(),
    txTotal: z.number(),
  }),
  uptime: z.number(), // seconds
  loadAvg: z.tuple([z.number(), z.number(), z.number()]),
  fans: z.array(z.object({
    id: z.number().optional(),
    name: z.string().optional(),
    rpm: z.number(),
    targetPercent: z.number().nullable().optional(),
  })),
  temps: z.array(z.object({
    name: z.string(),
    celsius: z.number(),
  })).optional(),
  power: z.object({
    watts: z.number().nullable(),
    volts: z.number().nullable(),
    amps: z.number().nullable(),
  }).nullable(),
})

export type SystemMetrics = z.infer<typeof SystemMetricsSchema>
