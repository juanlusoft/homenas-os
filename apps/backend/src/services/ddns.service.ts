import type { Database } from 'better-sqlite3'
import { encryptSecret, decryptSecret } from '../lib/crypto.js'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DdnsProvider = 'duckdns' | 'noip' | 'cloudflare' | 'dynu'

export interface DdnsConfig {
  id: number
  provider: DdnsProvider
  domain: string
  token: string
  username: string | null
  enabled: boolean
  lastUpdate: number | null
  lastIp: string | null
  lastStatus: string
  createdAt: number
}

export interface DdnsConfigInput {
  provider: DdnsProvider
  domain: string
  token: string
  username?: string
  enabled?: boolean
}

interface DdnsConfigRow {
  id: number
  provider: string
  domain: string
  token: string
  username: string | null
  enabled: number
  last_update: number | null
  last_ip: string | null
  last_status: string
  created_at: number
}

// ─── Row mapper ────────────────────────────────────────────────────────────────

function rowToConfig(row: DdnsConfigRow): DdnsConfig {
  return {
    id: row.id,
    provider: row.provider as DdnsProvider,
    domain: row.domain,
    token: decryptSecret(row.token),
    username: row.username,
    enabled: row.enabled === 1,
    lastUpdate: row.last_update,
    lastIp: row.last_ip,
    lastStatus: row.last_status,
    createdAt: row.created_at,
  }
}

// ─── getPublicIp ──────────────────────────────────────────────────────────────

export async function getPublicIp(): Promise<string> {
  const res = await fetch('https://api.ipify.org?format=text', {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`ipify returned ${res.status}`)
  const ip = (await res.text()).trim()
  if (!ip) throw new Error('Empty response from ipify')
  return ip
}

// ─── updateDns ────────────────────────────────────────────────────────────────

async function updateDuckDns(domain: string, token: string, ip: string): Promise<void> {
  // DuckDNS uses the subdomain part only (without .duckdns.org)
  const subdomain = domain.replace(/\.duckdns\.org$/, '')
  const url = `https://www.duckdns.org/update?domains=${encodeURIComponent(subdomain)}&token=${encodeURIComponent(token)}&ip=${encodeURIComponent(ip)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  const text = await res.text()
  if (!text.startsWith('OK')) {
    throw new Error(`DuckDNS update failed: ${text}`)
  }
}

async function updateNoIp(domain: string, token: string, username: string, ip: string): Promise<void> {
  const credentials = btoa(`${username}:${token}`)
  const url = `https://dynupdate.no-ip.com/nic/update?hostname=${encodeURIComponent(domain)}&myip=${encodeURIComponent(ip)}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      'User-Agent': 'HomeNasOS/3.0 admin@homenas.local',
    },
    signal: AbortSignal.timeout(15_000),
  })
  const text = await res.text()
  if (text.startsWith('nochg') || text.startsWith('good')) return
  throw new Error(`No-IP update failed: ${text}`)
}

async function updateCloudflare(domain: string, token: string, ip: string): Promise<void> {
  // token format: "zoneId:recordId" — split on ":"
  const parts = token.split(':')
  if (parts.length < 2) {
    throw new Error('Cloudflare token must be in format "zoneId:recordId:apiToken"')
  }
  const [zoneId, recordId, apiToken] = parts
  if (!zoneId || !recordId || !apiToken) {
    throw new Error('Cloudflare token must be in format "zoneId:recordId:apiToken"')
  }

  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'A',
      name: domain,
      content: ip,
      ttl: 60,
      proxied: false,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const data = await res.json() as { success: boolean; errors?: Array<{ message: string }> }
  if (!data.success) {
    const errMsg = data.errors?.map((e) => e.message).join(', ') ?? 'Unknown error'
    throw new Error(`Cloudflare update failed: ${errMsg}`)
  }
}

async function updateDynu(domain: string, token: string, ip: string): Promise<void> {
  const url = `https://api.dynu.com/nic/update?hostname=${encodeURIComponent(domain)}&myip=${encodeURIComponent(ip)}&password=${encodeURIComponent(token)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  const text = await res.text()
  if (text.startsWith('good') || text.startsWith('nochg')) return
  throw new Error(`Dynu update failed: ${text}`)
}

export async function updateDns(config: DdnsConfig, ip: string): Promise<void> {
  switch (config.provider) {
    case 'duckdns':
      return updateDuckDns(config.domain, config.token, ip)
    case 'noip':
      return updateNoIp(config.domain, config.token, config.username ?? '', ip)
    case 'cloudflare':
      return updateCloudflare(config.domain, config.token, ip)
    case 'dynu':
      return updateDynu(config.domain, config.token, ip)
    default:
      throw new Error(`Unknown DDNS provider: ${config.provider}`)
  }
}

// ─── configure ────────────────────────────────────────────────────────────────

export function configure(db: Database, input: DdnsConfigInput): DdnsConfig {
  const VALID_PROVIDERS: DdnsProvider[] = ['duckdns', 'noip', 'cloudflare', 'dynu']
  if (!VALID_PROVIDERS.includes(input.provider)) {
    throw new Error(`Invalid provider: ${input.provider}`)
  }
  if (!input.domain || typeof input.domain !== 'string') {
    throw new Error('domain is required')
  }
  if (!input.token || typeof input.token !== 'string') {
    throw new Error('token is required')
  }

  const result = db.prepare(`
    INSERT INTO ddns_config (provider, domain, token, username, enabled)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    input.provider,
    input.domain,
    encryptSecret(input.token),
    input.username ?? null,
    input.enabled !== false ? 1 : 0,
  )

  const row = db.prepare('SELECT * FROM ddns_config WHERE id = ?').get(result.lastInsertRowid) as DdnsConfigRow
  return rowToConfig(row)
}

// ─── remove ───────────────────────────────────────────────────────────────────

export function remove(db: Database, id: number): void {
  const result = db.prepare('DELETE FROM ddns_config WHERE id = ?').run(id)
  if (result.changes === 0) {
    throw new Error('DDNS config not found')
  }
}

// ─── getStatus ────────────────────────────────────────────────────────────────

export function getStatus(db: Database): DdnsConfig[] {
  const rows = db.prepare('SELECT * FROM ddns_config ORDER BY created_at ASC').all() as DdnsConfigRow[]
  return rows.map(rowToConfig)
}

// ─── Background updater ───────────────────────────────────────────────────────

let lastKnownIp: string | null = null
let updaterInterval: ReturnType<typeof setInterval> | null = null

async function runUpdater(db: Database): Promise<void> {
  let currentIp: string
  try {
    currentIp = await getPublicIp()
  } catch {
    return  // Can't get IP — skip this cycle
  }

  // Only update if IP changed or never updated
  if (currentIp === lastKnownIp) return
  lastKnownIp = currentIp

  const rows = db.prepare('SELECT * FROM ddns_config WHERE enabled = 1').all() as DdnsConfigRow[]
  for (const row of rows) {
    const config = rowToConfig(row)
    const now = Math.floor(Date.now() / 1000)
    try {
      await updateDns(config, currentIp)
      db.prepare(`
        UPDATE ddns_config SET last_update = ?, last_ip = ?, last_status = ? WHERE id = ?
      `).run(now, currentIp, 'ok', config.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      db.prepare(`
        UPDATE ddns_config SET last_update = ?, last_status = ? WHERE id = ?
      `).run(now, `error: ${msg.slice(0, 200)}`, config.id)
    }
  }
}

export function startDdnsUpdater(db: Database): void {
  if (updaterInterval) return

  // Run immediately on start
  void runUpdater(db)

  // Then every 5 minutes
  updaterInterval = setInterval(() => void runUpdater(db), 5 * 60 * 1000)
}

export function stopDdnsUpdater(): void {
  if (updaterInterval) {
    clearInterval(updaterInterval)
    updaterInterval = null
  }
}
