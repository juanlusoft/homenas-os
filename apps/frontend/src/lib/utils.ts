import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number, decimals = 0): string {
  if (bytes === 0) return '0 B'
  // Use base-1000 (commercial/SI units) — matches how drive manufacturers label capacity
  const k = 1000
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}


// Network APIs report bytes/second. Use the same decimal units in both views,
// with precision for low rates instead of producing an invalid negative unit.
export function formatTransferRate(bytesPerSecond: number): string {
  const rate = Number.isFinite(bytesPerSecond) ? Math.max(0, bytesPerSecond) : 0
  if (rate < 1) return `${Number(rate.toFixed(1))} B/s`
  return `${formatBytes(rate, 1)}/s`
}
