import { z } from 'zod'

export const NetworkInterfaceSchema = z.object({
  name: z.string(),
  ipv4: z.string().nullable(),
  ipv6: z.string().nullable(),
  mac: z.string().nullable(),
  isUp: z.boolean(),
  speed: z.string().nullable(),  // e.g. "1000Mb/s"
  rxBytes: z.number(),
  txBytes: z.number(),
})

export const WireguardPeerSchema = z.object({
  name: z.string(),
  publicKey: z.string(),
  allowedIPs: z.string(),
  endpoint: z.string().nullable(),
  lastHandshake: z.number().nullable(),  // unix timestamp
  transferRx: z.number(),
  transferTx: z.number(),
  presharedKey: z.string().nullable(),
})

export const WireguardStatusSchema = z.object({
  installed: z.boolean(),
  active: z.boolean(),
  interface: z.string(),
  listenPort: z.number().nullable(),
  publicKey: z.string().nullable(),
  serverIp: z.string().nullable(),
  peers: z.array(WireguardPeerSchema),
})

export const AddWireguardPeerSchema = z.object({
  name: z.string().min(1).max(64),
  allowedIPs: z.string()
    .refine(
      (val) => val.split(',').map(s => s.trim()).every(cidr =>
        /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(cidr) ||
        /^[0-9a-fA-F:]+\/\d{1,3}$/.test(cidr)
      ),
      { message: 'allowedIPs must be valid CIDR notation (e.g. 10.0.0.2/32)' }
    ),
  presharedKey: z.boolean().default(false),  // whether to generate a preshared key
})

export const DdnsStatusSchema = z.object({
  enabled: z.boolean(),
  provider: z.string().nullable(),
  domain: z.string().nullable(),
  lastUpdate: z.number().nullable(),
  lastIp: z.string().nullable(),
  status: z.string(),
})

export const SambaShareSchema = z.object({
  name: z.string(),
  path: z.string(),
  comment: z.string().default(''),
  public: z.boolean(),
  writable: z.boolean(),
  validUsers: z.array(z.string()),
})

export const CreateSambaShareSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/, 'Name must be 1-32 alphanumeric/underscore/hyphen characters'),
  path: z.string().min(1),
  comment: z.string().default(''),
  readonly: z.boolean().default(false),
  guestOk: z.boolean().default(false),
  validUsers: z.string().default(''),
})

export const UpdateSambaShareSchema = CreateSambaShareSchema.partial().omit({ name: true })

export const SambaSessionSchema = z.object({
  pid: z.string(),
  user: z.string(),
  machine: z.string(),
  connectedAt: z.string(),
})

export const NfsExportSchema = z.object({
  path: z.string(),
  clients: z.string(),
  options: z.string(),
})

export const CreateNfsExportSchema = z.object({
  path: z.string().min(1),
  clients: z.string().min(1),
  options: z.string().default('ro,sync,no_subtree_check'),
})

export const UpdateNfsExportSchema = CreateNfsExportSchema.partial().omit({})

export const NfsStatusSchema = z.object({
  exports: z.array(NfsExportSchema),
  connectedClients: z.array(z.string()),
})

export const WireguardInitSchema = z.object({
  port: z.number().int().min(1).max(65535).default(51820),
  dns: z.string().default('1.1.1.1'),
})

export type NetworkInterface = z.infer<typeof NetworkInterfaceSchema>
export type WireguardStatus = z.infer<typeof WireguardStatusSchema>
export type WireguardPeer = z.infer<typeof WireguardPeerSchema>
export type AddWireguardPeerInput = z.infer<typeof AddWireguardPeerSchema>
export type WireguardInitInput = z.infer<typeof WireguardInitSchema>
export type DdnsStatus = z.infer<typeof DdnsStatusSchema>
export type SambaShare = z.infer<typeof SambaShareSchema>
export type CreateSambaShareInput = z.infer<typeof CreateSambaShareSchema>
export type UpdateSambaShareInput = z.infer<typeof UpdateSambaShareSchema>
export type SambaSession = z.infer<typeof SambaSessionSchema>
export type NfsExport = z.infer<typeof NfsExportSchema>
export type CreateNfsExportInput = z.infer<typeof CreateNfsExportSchema>
export type UpdateNfsExportInput = z.infer<typeof UpdateNfsExportSchema>
export type NfsStatus = z.infer<typeof NfsStatusSchema>
