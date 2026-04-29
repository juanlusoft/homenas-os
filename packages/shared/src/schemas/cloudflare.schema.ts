import { z } from 'zod'

export const CloudflareStatusSchema = z.object({
  configured: z.boolean(),          // token exists in settings
  installed: z.boolean(),           // cloudflared binary present
  running: z.boolean(),             // systemd service active
  tunnelUrl: z.string().nullable(), // e.g. "https://nas.example.com"
  connectorId: z.string().nullable(),
  lastError: z.string().nullable(),
})

export const CloudflareConfigSchema = z.object({
  token: z.string().min(10),        // Cloudflare Tunnel token
})

export type CloudflareStatus = z.infer<typeof CloudflareStatusSchema>
export type CloudflareConfig = z.infer<typeof CloudflareConfigSchema>
