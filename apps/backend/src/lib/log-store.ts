// In-memory circular log buffer — keeps the last MAX_ENTRIES log entries.
// Use logEntry() to push entries; query via getEntries().
// Designed for dev/debug: exposes recent backend errors without needing SSH + journalctl.

const MAX_ENTRIES = 500

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  ts: number      // Unix ms timestamp
  level: LogLevel
  ctx: string     // Context label: 'upload', 'ota', 'auth', etc.
  msg: string
  data?: unknown  // Optional structured payload (error details, paths, etc.)
}

const buffer: LogEntry[] = []

export function logEntry(level: LogLevel, ctx: string, msg: string, data?: unknown): void {
  buffer.push({ ts: Date.now(), level, ctx, msg, data })
  if (buffer.length > MAX_ENTRIES) {
    buffer.shift()
  }
}

export function logInfo(ctx: string, msg: string, data?: unknown): void {
  logEntry('info', ctx, msg, data)
}

export function logWarn(ctx: string, msg: string, data?: unknown): void {
  logEntry('warn', ctx, msg, data)
}

export function logError(ctx: string, msg: string, data?: unknown): void {
  logEntry('error', ctx, msg, data)
}

export interface GetEntriesOptions {
  level?: LogLevel
  ctx?: string
  limit?: number
}

export function getEntries(opts: GetEntriesOptions = {}): LogEntry[] {
  let entries = buffer.slice()

  if (opts.level) {
    entries = entries.filter((e) => e.level === opts.level)
  }
  if (opts.ctx) {
    entries = entries.filter((e) => e.ctx === opts.ctx)
  }

  // Return most recent first
  entries = entries.reverse()

  if (opts.limit && opts.limit > 0) {
    entries = entries.slice(0, opts.limit)
  }

  return entries
}

export function clearEntries(): void {
  buffer.length = 0
}
