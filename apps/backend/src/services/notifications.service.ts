/**
 * Notification service — email (SMTP via nodemailer) + Telegram Bot API
 *
 * All alert calls are fire-and-forget: errors are logged but never propagate.
 * Configuration is stored in the settings table (sensitive fields encrypted with AES-256-GCM).
 *
 * Settings keys:
 *   notif_email_enabled, notif_email_host, notif_email_port, notif_email_secure,
 *   notif_email_user, notif_email_pass (encrypted), notif_email_from, notif_email_to
 *   notif_telegram_enabled, notif_telegram_token (encrypted), notif_telegram_chat_id
 *   notif_on_login  — '1' to alert on every successful login (noisy, opt-in)
 */

import nodemailer from 'nodemailer'
import type { Database } from 'better-sqlite3'
import { getSetting, setSetting } from '../lib/settings.js'
import { encryptSecret, decryptSecret } from '../lib/crypto.js'
import { logError } from '../lib/log-store.js'

export type AlertLevel = 'info' | 'warning' | 'error'

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fire-and-forget alert: saves to the notifications table and delivers via
 * configured channels (email and/or Telegram). Never throws.
 */
export async function sendAlert(
  db: Database,
  level: AlertLevel,
  title: string,
  message: string,
): Promise<void> {
  // Persist in-app notification
  try {
    db.prepare(`INSERT INTO notifications (type, title, message) VALUES (?, ?, ?)`)
      .run(level, title, message)
  } catch (err) {
    logError('notifications', 'Failed to save notification to DB', { err })
  }

  // External channels — always fire-and-forget
  const deliveries: Promise<void>[] = []

  if (getSetting(db, 'notif_email_enabled') === '1') {
    deliveries.push(
      deliverEmail(db, title, message).catch((err) =>
        logError('notifications', 'Email delivery failed', { err })
      )
    )
  }

  if (getSetting(db, 'notif_telegram_enabled') === '1') {
    deliveries.push(
      deliverTelegram(db, level, title, message).catch((err) =>
        logError('notifications', 'Telegram delivery failed', { err })
      )
    )
  }

  await Promise.allSettled(deliveries)
}

// ─── Email ────────────────────────────────────────────────────────────────────

export interface EmailConfig {
  enabled: boolean
  host: string
  port: number
  secure: boolean   // true = SSL/TLS on connect (port 465), false = STARTTLS (587)
  user: string
  password: string  // plaintext — encrypted before storing
  from: string
  to: string        // single recipient or comma-separated list
}

export function getEmailConfig(db: Database): EmailConfig {
  return {
    enabled:  getSetting(db, 'notif_email_enabled') === '1',
    host:     getSetting(db, 'notif_email_host') ?? '',
    port:     parseInt(getSetting(db, 'notif_email_port') ?? '587', 10),
    secure:   getSetting(db, 'notif_email_secure') === '1',
    user:     getSetting(db, 'notif_email_user') ?? '',
    password: '',   // never returned — write-only
    from:     getSetting(db, 'notif_email_from') ?? '',
    to:       getSetting(db, 'notif_email_to') ?? '',
  }
}

export function saveEmailConfig(db: Database, cfg: Partial<EmailConfig>): void {
  if (cfg.enabled !== undefined) setSetting(db, 'notif_email_enabled', cfg.enabled ? '1' : '0')
  if (cfg.host     !== undefined) setSetting(db, 'notif_email_host',    cfg.host)
  if (cfg.port     !== undefined) setSetting(db, 'notif_email_port',    String(cfg.port))
  if (cfg.secure   !== undefined) setSetting(db, 'notif_email_secure',  cfg.secure ? '1' : '0')
  if (cfg.user     !== undefined) setSetting(db, 'notif_email_user',    cfg.user)
  if (cfg.password !== undefined && cfg.password !== '') {
    setSetting(db, 'notif_email_pass', encryptSecret(cfg.password))
  }
  if (cfg.from !== undefined) setSetting(db, 'notif_email_from', cfg.from)
  if (cfg.to   !== undefined) setSetting(db, 'notif_email_to',   cfg.to)
}

async function deliverEmail(db: Database, subject: string, text: string): Promise<void> {
  const host   = getSetting(db, 'notif_email_host') ?? ''
  const port   = parseInt(getSetting(db, 'notif_email_port') ?? '587', 10)
  const secure = getSetting(db, 'notif_email_secure') === '1'
  const user   = getSetting(db, 'notif_email_user') ?? ''
  const passEnc = getSetting(db, 'notif_email_pass') ?? ''
  const from   = getSetting(db, 'notif_email_from') || user
  const to     = getSetting(db, 'notif_email_to') ?? ''

  if (!host || !to) return

  const pass = decryptSecret(passEnc)
  // TLS verification is ON by default. Only opt out if the user has
  // explicitly enabled `notif_email_insecure_tls` (for LAN SMTP relays
  // with self-signed certs). Disabling it globally lets a MITM intercept
  // SMTP credentials and rewrite alerts.
  const insecureTls = (getSetting(db, 'notif_email_insecure_tls') ?? '0') === '1'
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    ...(insecureTls ? { tls: { rejectUnauthorized: false } } : {}),
  })

  await transporter.sendMail({
    from,
    to,
    subject: `[HomeNas] ${subject}`,
    text:    `${subject}\n\n${text}\n\n— HomeNas OS`,
  })
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

export interface TelegramConfig {
  enabled: boolean
  token:   string  // plaintext — encrypted before storing
  chatId:  string
}

const LEVEL_EMOJI: Record<AlertLevel, string> = {
  info:    'ℹ️',
  warning: '⚠️',
  error:   '🚨',
}

export function getTelegramConfig(db: Database): TelegramConfig {
  return {
    enabled: getSetting(db, 'notif_telegram_enabled') === '1',
    token:   '',    // write-only
    chatId:  getSetting(db, 'notif_telegram_chat_id') ?? '',
  }
}

export function saveTelegramConfig(db: Database, cfg: Partial<TelegramConfig>): void {
  if (cfg.enabled !== undefined) setSetting(db, 'notif_telegram_enabled', cfg.enabled ? '1' : '0')
  if (cfg.token !== undefined && cfg.token !== '') {
    setSetting(db, 'notif_telegram_token', encryptSecret(cfg.token))
  }
  if (cfg.chatId !== undefined) setSetting(db, 'notif_telegram_chat_id', cfg.chatId)
}

async function deliverTelegram(db: Database, level: AlertLevel, title: string, message: string): Promise<void> {
  const tokenEnc = getSetting(db, 'notif_telegram_token') ?? ''
  const chatId   = getSetting(db, 'notif_telegram_chat_id') ?? ''

  if (!tokenEnc || !chatId) return

  const token = decryptSecret(tokenEnc)
  const emoji = LEVEL_EMOJI[level]
  const text  = `${emoji} *[HomeNas] ${escapeMarkdown(title)}*\n${escapeMarkdown(message)}`

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2' }),
  })

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Telegram API error ${resp.status}: ${body}`)
  }
}

// Escape special chars required by MarkdownV2
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}
