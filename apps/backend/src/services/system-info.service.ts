import os from 'os'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { exec } from '../lib/exec.js'
import type Database from 'better-sqlite3'
import type { SystemInfo, UpsStatus, Notification } from '@homenas/shared'

// Read version from root package.json once at startup
function readAppVersion(): string {
  try {
    // WorkingDirectory = apps/backend → ../../package.json = repo root
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), '../../package.json'), 'utf-8')) as { version?: string }
    return pkg.version ?? '1.0.0'
  } catch {
    return '1.0.0'
  }
}

const APP_VERSION = readAppVersion()

export async function getSystemInfo(): Promise<SystemInfo> {
  // OS string: try lsb_release first, then /etc/os-release, fallback to "Linux"
  let osString = 'Linux'
  try {
    const lsbResult = await exec('lsb_release', ['-ds'])
    if (lsbResult.exitCode === 0 && lsbResult.stdout.trim()) {
      osString = lsbResult.stdout.trim().replace(/"/g, '')
    } else {
      const osRelease = readFileSync('/etc/os-release', 'utf-8')
      const prettyLine = osRelease.split('\n').find(l => l.startsWith('PRETTY_NAME='))
      if (prettyLine) {
        osString = prettyLine.split('=')[1].replace(/"/g, '').trim()
      }
    }
  } catch {
    // fallback remains "Linux"
  }

  // Kernel version
  let kernel = 'unknown'
  try {
    const kernelResult = await exec('uname', ['-r'])
    if (kernelResult.exitCode === 0) {
      kernel = kernelResult.stdout.trim()
    }
  } catch {
    // fallback
  }

  // IP addresses: non-internal IPv4
  const interfaces = os.networkInterfaces()
  const ipAddresses: string[] = []
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ipAddresses.push(addr.address)
      }
    }
  }

  return {
    hostname: os.hostname(),
    os: osString,
    kernel,
    arch: os.arch(),
    nodeVersion: process.version,
    appVersion: APP_VERSION,
    uptime: os.uptime(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ipAddresses,
  }
}

export async function getUpsStatus(): Promise<UpsStatus> {
  const notConnected: UpsStatus = {
    connected: false,
    model: null,
    status: null,
    batteryCharge: null,
    batteryRuntime: null,
    inputVoltage: null,
    outputVoltage: null,
    loadPercent: null,
  }

  try {
    const result = await exec('upsc', ['ups@localhost'])
    if (result.exitCode !== 0) {
      return notConnected
    }

    // Parse key: value lines from upsc output
    const parsed: Record<string, string> = {}
    for (const line of result.stdout.split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      parsed[key] = value
    }

    const parseFloat_ = (v: string | undefined): number | null => {
      if (v === undefined) return null
      const n = parseFloat(v)
      return isNaN(n) ? null : n
    }

    return {
      connected: true,
      model: parsed['ups.model'] ?? parsed['device.model'] ?? null,
      status: parsed['ups.status'] ?? null,
      batteryCharge: parseFloat_(parsed['battery.charge']),
      batteryRuntime: parseFloat_(parsed['battery.runtime']),
      inputVoltage: parseFloat_(parsed['input.voltage']),
      outputVoltage: parseFloat_(parsed['output.voltage']),
      loadPercent: parseFloat_(parsed['ups.load']),
    }
  } catch {
    return notConnected
  }
}

// ─── Notifications (SQLite) ───────────────────────────────────────────────────

interface NotificationRow {
  id: number
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  read: number
  created_at: number
}

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    read: row.read === 1,
    createdAt: row.created_at,
  }
}

export function getNotifications(db: Database.Database): Notification[] {
  const rows = db
    .prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100')
    .all() as NotificationRow[]
  return rows.map(rowToNotification)
}

export function markNotificationAsRead(db: Database.Database, id: number): boolean {
  const result = db
    .prepare('UPDATE notifications SET read = 1 WHERE id = ?')
    .run(id)
  return result.changes > 0
}

export function createNotification(
  db: Database.Database,
  data: { type: 'info' | 'warning' | 'error' | 'success'; title: string; message: string }
): Notification {
  const result = db
    .prepare('INSERT INTO notifications (type, title, message) VALUES (?, ?, ?)')
    .run(data.type, data.title, data.message)

  const row = db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .get(result.lastInsertRowid) as NotificationRow

  return rowToNotification(row)
}
