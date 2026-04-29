import { exec } from '../lib/exec.js'
import { mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import type { Database } from 'better-sqlite3'
import type { CloudflareStatus } from '@homenas/shared'
import { getSetting, setSetting, deleteSetting } from '../lib/settings.js'
import { encryptSecret, decryptSecret } from '../lib/crypto.js'

const CLOUDFLARED_BIN = '/usr/local/bin/cloudflared'
const SERVICE_NAME = 'cloudflared'

// Platform-specific download URL
function getDownloadUrl(): string {
  if (process.platform === 'darwin') {
    return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64'
  }
  return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64'
}

export function isInstalled(): boolean {
  return existsSync(CLOUDFLARED_BIN)
}

export async function isRunning(): Promise<boolean> {
  try {
    const result = await exec('systemctl', ['is-active', SERVICE_NAME])
    return result.exitCode === 0
  } catch {
    // systemctl not found (macOS dev) or other error
    return false
  }
}

export async function getStatus(db: Database): Promise<CloudflareStatus> {
  const rawToken = getSetting(db, 'cloudflare_token')
  const token = rawToken ? decryptSecret(rawToken) : null
  const tunnelUrl = getSetting(db, 'cloudflare_tunnel_url')
  const connectorId = getSetting(db, 'cloudflare_connector_id')
  const lastError = getSetting(db, 'cloudflare_last_error')

  const installed = isInstalled()
  const running = installed ? await isRunning() : false

  return {
    configured: token !== null,
    installed,
    running,
    tunnelUrl,
    connectorId,
    lastError,
  }
}

export async function install(): Promise<void> {
  const downloadUrl = getDownloadUrl()

  const download = await exec('curl', ['-L', '-o', '/tmp/cloudflared', downloadUrl])
  if (download.exitCode !== 0) {
    throw new Error(`Failed to download cloudflared: ${download.stderr}`)
  }

  const chmod = await exec('chmod', ['+x', '/tmp/cloudflared'])
  if (chmod.exitCode !== 0) {
    throw new Error(`Failed to chmod cloudflared: ${chmod.stderr}`)
  }

  const mv = await exec('mv', ['/tmp/cloudflared', CLOUDFLARED_BIN])
  if (mv.exitCode !== 0) {
    throw new Error(`Failed to move cloudflared to ${CLOUDFLARED_BIN}: ${mv.stderr}`)
  }
}

// Cloudflare tunnel tokens are base64url-encoded JWTs — allow only safe chars
const TOKEN_RE = /^[A-Za-z0-9._\-]{50,2048}$/

function validateToken(token: string): void {
  if (!TOKEN_RE.test(token)) {
    throw new Error('Invalid token format: must be 50–2048 characters, alphanumeric with . _ -')
  }
}

export async function configure(db: Database, token: string): Promise<void> {
  validateToken(token)

  // Save token to settings (encrypted)
  setSetting(db, 'cloudflare_token', encryptSecret(token))

  // Clear any previous error
  deleteSetting(db, 'cloudflare_last_error')

  // Write token to env file (mode 0600) — keeps it out of ps aux / unit file
  try {
    await mkdir('/etc/cloudflared', { recursive: true })
    await writeFile('/etc/cloudflared/tunnel.env', `TUNNEL_TOKEN=${token}\n`, { mode: 0o600 })
  } catch (envErr) {
    const message = envErr instanceof Error ? envErr.message : String(envErr)
    setSetting(db, 'cloudflare_last_error', `env file write failed: ${message}`)
    throw new Error(`Failed to write cloudflared env file: ${message}`)
  }

  // Write systemd unit — token loaded from EnvironmentFile, not in ExecStart
  try {
    const unitContent = `[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
EnvironmentFile=/etc/cloudflared/tunnel.env
ExecStart=${CLOUDFLARED_BIN} tunnel --no-autoupdate run
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
`
    await writeFile('/etc/systemd/system/cloudflared.service', unitContent, { mode: 0o644 })

    await exec('systemctl', ['daemon-reload'])
    await exec('systemctl', ['enable', SERVICE_NAME])
  } catch (unitErr) {
    const message = unitErr instanceof Error ? unitErr.message : String(unitErr)
    setSetting(db, 'cloudflare_last_error', `unit file write failed: ${message}`)
    throw new Error(`Failed to configure cloudflared service: ${message}`)
  }
}

export async function start(db: Database): Promise<void> {
  const result = await exec('systemctl', ['start', SERVICE_NAME])
  if (result.exitCode !== 0) {
    const errMsg = result.stderr || result.stdout || 'systemctl start failed'
    setSetting(db, 'cloudflare_last_error', errMsg)
    throw new Error(errMsg)
  }
  // Clear error on success
  deleteSetting(db, 'cloudflare_last_error')
}

export async function stop(db: Database): Promise<void> {
  const result = await exec('systemctl', ['stop', SERVICE_NAME])
  if (result.exitCode !== 0) {
    const errMsg = result.stderr || result.stdout || 'systemctl stop failed'
    setSetting(db, 'cloudflare_last_error', errMsg)
    throw new Error(errMsg)
  }
}

export async function remove(db: Database): Promise<void> {
  // Stop the service first (ignore errors — it may already be stopped)
  await exec('systemctl', ['stop', SERVICE_NAME]).catch(() => null)

  await exec('systemctl', ['disable', SERVICE_NAME])
  await exec('rm', ['-f', CLOUDFLARED_BIN])
  await exec('rm', ['-f', '/etc/systemd/system/cloudflared.service'])
  await exec('rm', ['-f', '/etc/cloudflared/tunnel.env'])
  await exec('systemctl', ['daemon-reload'])

  // Remove all cloudflare-related settings
  deleteSetting(db, 'cloudflare_token')
  deleteSetting(db, 'cloudflare_tunnel_url')
  deleteSetting(db, 'cloudflare_connector_id')
  deleteSetting(db, 'cloudflare_last_error')
}
