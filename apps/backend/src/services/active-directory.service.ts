import { existsSync, readFileSync } from 'node:fs'
import { execa } from 'execa'
import { exec } from '../lib/exec.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ADStatus {
  sambaInstalled: boolean
  domainProvisioned: boolean
  serviceActive: boolean
  domain: string | null
  realm: string | null
}

export interface ADUser {
  username: string
  displayName: string | null
  enabled: boolean
  email: string | null
}

export interface ADGroup {
  name: string
  members: string[]
}

export interface ADComputer {
  name: string
}

export interface InstallProgress {
  running: boolean
  output: string[]
  error: string | null
  completed: boolean
}

// ─── Module-level install state ───────────────────────────────────────────────

let installState: InstallProgress = {
  running: false,
  output: [],
  error: null,
  completed: false,
}

function resetInstallState() {
  installState = { running: false, output: [], error: null, completed: false }
}

function appendOutput(line: string) {
  installState.output = [...installState.output, line]
  if (installState.output.length > 500) {
    installState.output = installState.output.slice(-500)
  }
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const USERNAME_RE = /^[a-zA-Z0-9_-]{1,20}$/
const DOMAIN_SHORT_RE = /^[a-zA-Z0-9]{1,15}$/
const REALM_RE = /^[a-zA-Z0-9][a-zA-Z0-9.-]{2,63}$/
const GROUP_RE = /^[a-zA-Z0-9 _-]{1,64}$/

export function validateUsername(u: string): boolean {
  return USERNAME_RE.test(u)
}
export function validateDomainShort(d: string): boolean {
  return DOMAIN_SHORT_RE.test(d)
}
export function validateRealm(r: string): boolean {
  return REALM_RE.test(r) && r.includes('.')
}
export function validateGroup(g: string): boolean {
  return GROUP_RE.test(g)
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function getStatus(): Promise<ADStatus> {
  // Check if samba-tool is available
  const whichResult = await exec('which', ['samba-tool'])
  const sambaInstalled = whichResult.exitCode === 0

  if (!sambaInstalled) {
    return { sambaInstalled: false, domainProvisioned: false, serviceActive: false, domain: null, realm: null }
  }

  // Check if smb.conf is provisioned (contains [global] section)
  const SMB_CONF = '/etc/samba/smb.conf'
  let domainProvisioned = false
  let domain: string | null = null
  let realm: string | null = null

  if (existsSync(SMB_CONF)) {
    try {
      const conf = readFileSync(SMB_CONF, 'utf-8')
      if (conf.includes('[global]')) {
        domainProvisioned = true
        // Extract domain and realm from smb.conf
        const domainMatch = conf.match(/^\s*workgroup\s*=\s*(.+)$/m)
        const realmMatch = conf.match(/^\s*realm\s*=\s*(.+)$/m)
        domain = domainMatch ? domainMatch[1].trim() : null
        realm = realmMatch ? realmMatch[1].trim() : null
      }
    } catch {
      // ignore read errors
    }
  }

  // Check if samba-ad-dc service is active
  const serviceResult = await exec('systemctl', ['is-active', 'samba-ad-dc'])
  const serviceActive = serviceResult.stdout.trim() === 'active'

  return { sambaInstalled, domainProvisioned, serviceActive, domain, realm }
}

// ─── Install ──────────────────────────────────────────────────────────────────

export function getInstallProgress(): InstallProgress {
  return { ...installState, output: [...installState.output] }
}

export function startInstall(): void {
  if (installState.running) return
  resetInstallState()
  installState.running = true

  runInstall().catch((err: unknown) => {
    installState.error = err instanceof Error ? err.message : String(err)
    installState.running = false
    appendOutput(`ERROR: ${installState.error}`)
  })
}

async function runInstall(): Promise<void> {
  try {
    appendOutput('Starting Samba AD DC installation...')

    // Set DEBIAN_FRONTEND noninteractive to suppress interactive prompts
    const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }

    const proc = execa(
      'apt-get',
      [
        'install', '-y',
        'samba',
        'krb5-config',
        'winbind',
        'samba-dsdb-modules',
        'samba-vfs-modules',
      ],
      { shell: false, reject: false, env }
    )

    const appendChunk = (chunk: Buffer) => {
      const lines = chunk.toString().split('\n')
      for (const line of lines) {
        if (line.trim()) appendOutput(line)
      }
    }

    if (proc.stdout) proc.stdout.on('data', appendChunk)
    if (proc.stderr) proc.stderr.on('data', appendChunk)

    const result = await proc

    if (result.exitCode !== 0) {
      throw new Error(`apt-get install failed (exit ${result.exitCode})`)
    }

    appendOutput('Samba packages installed successfully.')
    appendOutput('You can now provision a domain.')
    installState.running = false
    installState.completed = true
  } catch (err) {
    installState.error = err instanceof Error ? err.message : String(err)
    installState.running = false
    appendOutput(`ERROR: ${installState.error}`)
  }
}

// ─── Domain provisioning ──────────────────────────────────────────────────────

export interface ProvisionConfig {
  domain: string   // short NetBIOS name, 1-15 chars, letters/digits only
  realm: string    // FQDN, e.g. CORP.EXAMPLE.COM
  adminPassword: string
}

export async function provisionDomain(config: ProvisionConfig): Promise<void> {
  const { domain, realm, adminPassword } = config

  if (!validateDomainShort(domain)) {
    throw new Error('Invalid domain name: must be 1-15 alphanumeric characters')
  }
  if (!validateRealm(realm)) {
    throw new Error('Invalid realm: must be a valid FQDN (e.g. CORP.EXAMPLE.COM)')
  }
  if (adminPassword.length < 8) {
    throw new Error('Admin password must be at least 8 characters')
  }

  const result = await exec('samba-tool', [
    'domain', 'provision',
    '--use-rfc2307',
    `--domain=${domain.toUpperCase()}`,
    `--realm=${realm.toUpperCase()}`,
    '--server-role=dc',
    '--dns-backend=SAMBA_INTERNAL',
    `--adminpass=${adminPassword}`,
  ])

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'samba-tool domain provision failed')
  }
}

// ─── Service control ──────────────────────────────────────────────────────────

async function systemctlAction(action: 'start' | 'stop' | 'restart'): Promise<void> {
  const result = await exec('systemctl', [action, 'samba-ad-dc'])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `systemctl ${action} samba-ad-dc failed`)
  }
}

export function startService(): Promise<void> {
  return systemctlAction('start')
}
export function stopService(): Promise<void> {
  return systemctlAction('stop')
}
export function restartService(): Promise<void> {
  return systemctlAction('restart')
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<ADUser[]> {
  const listResult = await exec('samba-tool', ['user', 'list'])
  if (listResult.exitCode !== 0) {
    throw new Error(listResult.stderr || 'samba-tool user list failed')
  }

  const usernames = listResult.stdout
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const users: ADUser[] = []

  for (const username of usernames) {
    const showResult = await exec('samba-tool', ['user', 'show', username, '--attributes=sAMAccountName,displayName,userAccountControl,mail'])
    if (showResult.exitCode !== 0) continue

    const raw = showResult.stdout

    const displayNameMatch = raw.match(/^displayName:\s*(.+)$/m)
    const mailMatch = raw.match(/^mail:\s*(.+)$/m)
    const uacMatch = raw.match(/^userAccountControl:\s*(\d+)$/m)

    // userAccountControl bit 2 (0x2) = ACCOUNTDISABLE
    const uac = uacMatch ? parseInt(uacMatch[1], 10) : 0
    const enabled = (uac & 0x2) === 0

    users.push({
      username,
      displayName: displayNameMatch ? displayNameMatch[1].trim() : null,
      enabled,
      email: mailMatch ? mailMatch[1].trim() : null,
    })
  }

  return users
}

export async function createUser(username: string, password: string, displayName: string): Promise<void> {
  if (!validateUsername(username)) {
    throw new Error('Invalid username: must be 1-20 alphanumeric/underscore/hyphen characters')
  }
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }

  const args = ['user', 'create', username, password]
  if (displayName.trim()) {
    args.push(`--given-name=${displayName.trim()}`)
  }

  const result = await exec('samba-tool', args)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'samba-tool user create failed')
  }
}

export async function deleteUser(username: string): Promise<void> {
  if (!validateUsername(username)) {
    throw new Error('Invalid username')
  }
  if (username.toLowerCase() === 'administrator') {
    throw new Error('Cannot delete the Administrator account')
  }

  const result = await exec('samba-tool', ['user', 'delete', username])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'samba-tool user delete failed')
  }
}

export async function enableUser(username: string): Promise<void> {
  if (!validateUsername(username)) throw new Error('Invalid username')
  const result = await exec('samba-tool', ['user', 'enable', username])
  if (result.exitCode !== 0) throw new Error(result.stderr || 'samba-tool user enable failed')
}

export async function disableUser(username: string): Promise<void> {
  if (!validateUsername(username)) throw new Error('Invalid username')
  if (username.toLowerCase() === 'administrator') throw new Error('Cannot disable Administrator')
  const result = await exec('samba-tool', ['user', 'disable', username])
  if (result.exitCode !== 0) throw new Error(result.stderr || 'samba-tool user disable failed')
}

export async function resetPassword(username: string, newPassword: string): Promise<void> {
  if (!validateUsername(username)) throw new Error('Invalid username')
  if (newPassword.length < 8) throw new Error('Password must be at least 8 characters')

  const result = await exec('samba-tool', ['user', 'setpassword', username, `--newpassword=${newPassword}`])
  if (result.exitCode !== 0) throw new Error(result.stderr || 'samba-tool user setpassword failed')
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export async function listGroups(): Promise<ADGroup[]> {
  const listResult = await exec('samba-tool', ['group', 'list'])
  if (listResult.exitCode !== 0) {
    throw new Error(listResult.stderr || 'samba-tool group list failed')
  }

  const groupNames = listResult.stdout
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const groups: ADGroup[] = []

  for (const name of groupNames) {
    const membersResult = await exec('samba-tool', ['group', 'listmembers', name])
    const members = membersResult.exitCode === 0
      ? membersResult.stdout.split('\n').map(l => l.trim()).filter(Boolean)
      : []
    groups.push({ name, members })
  }

  return groups
}

export async function createGroup(name: string): Promise<void> {
  if (!validateGroup(name)) {
    throw new Error('Invalid group name: must be 1-64 chars, letters/digits/spaces/underscores/hyphens')
  }
  const result = await exec('samba-tool', ['group', 'add', name])
  if (result.exitCode !== 0) throw new Error(result.stderr || 'samba-tool group add failed')
}

export async function deleteGroup(name: string): Promise<void> {
  if (!validateGroup(name)) throw new Error('Invalid group name')
  const result = await exec('samba-tool', ['group', 'delete', name])
  if (result.exitCode !== 0) throw new Error(result.stderr || 'samba-tool group delete failed')
}

export async function addMember(group: string, username: string): Promise<void> {
  if (!validateGroup(group)) throw new Error('Invalid group name')
  if (!validateUsername(username)) throw new Error('Invalid username')
  const result = await exec('samba-tool', ['group', 'addmembers', group, username])
  if (result.exitCode !== 0) throw new Error(result.stderr || 'samba-tool group addmembers failed')
}

export async function removeMember(group: string, username: string): Promise<void> {
  if (!validateGroup(group)) throw new Error('Invalid group name')
  if (!validateUsername(username)) throw new Error('Invalid username')
  const result = await exec('samba-tool', ['group', 'removemembers', group, username])
  if (result.exitCode !== 0) throw new Error(result.stderr || 'samba-tool group removemembers failed')
}

// ─── Computers ────────────────────────────────────────────────────────────────

export async function listComputers(): Promise<ADComputer[]> {
  const result = await exec('samba-tool', ['computer', 'list'])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'samba-tool computer list failed')
  }
  const names = result.stdout.split('\n').map(l => l.trim()).filter(Boolean)
  return names.map(name => ({ name }))
}
