import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import bcryptjs from 'bcryptjs'
import { execa } from 'execa'
import { readFile, writeFile } from 'node:fs/promises'
import { execWithInput, sudoWrap } from '../../lib/exec.js'
import { getSetting, setSetting } from '../../lib/settings.js'
import { createUsersRepo } from '../../repositories/users.repo.js'
import { createSessionsRepo } from '../../repositories/sessions.repo.js'
import { getNetworkInfo, configureNetwork } from '../../services/setup-network.service.js'
import { configurePool } from '../../services/setup-pool.service.js'

// ─── Samba user setup ─────────────────────────────────────────────────────────

async function setupSambaUser(username: string, password: string): Promise<void> {
  // Ensure sambashare group exists
  await execa(...sudoWrap('groupadd', ['-f', 'sambashare']), { reject: false })

  // Create Linux system user if not already present (nologin shell — SMB only)
  const idCheck = await execa(...sudoWrap('id', [username]), { reject: false })
  if (idCheck.exitCode !== 0) {
    await execa(...sudoWrap('useradd', ['-M', '-s', '/usr/sbin/nologin', '-G', 'sambashare', username]), { reject: false })
  } else {
    await execa(...sudoWrap('usermod', ['-aG', 'sambashare', username]), { reject: false })
  }

  // Create or update Samba password (-a adds user; if already exists, retry without -a)
  const passInput = `${password}\n${password}\n`
  const addResult = await execWithInput('smbpasswd', ['-a', '-s', username], passInput)
  if (addResult.exitCode !== 0) {
    await execWithInput('smbpasswd', ['-s', username], passInput)
  }

  // Enable the Samba user
  await execa(...sudoWrap('smbpasswd', ['-e', username]), { reject: false })

  // Reload Samba if running
  await execa(...sudoWrap('systemctl', ['reload-or-restart', 'smbd']), { reject: false })
}

// ─── Fix storage pool permissions + ensure default SMB share exists ──────────

async function fixPoolPermissions(): Promise<void> {
  const SMB_CONF = '/etc/samba/smb.conf'
  try {
    const mounts = await readFile('/proc/mounts', 'utf-8')
    for (const line of mounts.split('\n')) {
      const parts = line.trim().split(/\s+/)
      if (parts[2] === 'fuse.mergerfs' && parts[1]) {
        const mountPoint = parts[1].replace(/\\040/g, ' ')
        await execa(...sudoWrap('chown', ['root:sambashare', mountPoint]), { reject: false })
        await execa(...sudoWrap('chmod', ['2775', mountPoint]), { reject: false })

        // Ensure a [storage] share exists in smb.conf pointing at this pool
        try {
          const conf = await readFile(SMB_CONF, 'utf-8').catch(() => '')
          if (!conf.includes('[storage]')) {
            const shareSection = `\n[storage]\n   path = ${mountPoint}\n   comment = HomeNas Storage\n   browseable = yes\n   read only = no\n   valid users = @sambashare\n   create mask = 0664\n   directory mask = 0775\n`
            const tmpPath = '/tmp/smb.conf.tmp'
            await writeFile(tmpPath, conf + shareSection)
            await execa(...sudoWrap('mv', [tmpPath, SMB_CONF]), { reject: false })
            await execa(...sudoWrap('systemctl', ['reload-or-restart', 'smbd']), { reject: false })
          }
        } catch {
          // smb.conf write failed — non-fatal
        }
      }
    }
  } catch {
    // /proc/mounts not available or pool not mounted yet — skip
  }
}

const BCRYPT_ROUNDS = 12
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

const strongSetupPassword = z.string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128)
  .refine((p) => /[A-Z]/.test(p), { message: 'Debe incluir al menos una letra mayúscula' })
  .refine((p) => /[0-9]/.test(p), { message: 'Debe incluir al menos un número' })

const SetupAccountSchema = z.object({
  username:        z.string().min(5, 'El usuario debe tener al menos 5 caracteres').max(32).regex(/^[a-zA-Z0-9_\-]+$/, 'Solo letras, números, _ y -'),
  newPassword:     strongSetupPassword,
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

// Keep old schema for backwards compat
const SetupPasswordSchema = z.object({
  newPassword: strongSetupPassword,
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, { path: ['confirmPassword'] })

const SetupNetworkSchema = z.object({
  interface: z.string().min(1).max(15).regex(/^[a-zA-Z0-9_.\-]+$/),
  mode: z.enum(['dhcp', 'static']),
  ip:      z.string().optional(),
  prefix:  z.number().int().min(1).max(32).optional(),
  gateway: z.string().optional(),
  dns:     z.string().optional(),
})

const DiskConfigSchema = z.object({
  device: z.string().regex(/^\/dev\/(sd[a-z]+|hd[a-z]+|nvme\d+n\d+|mmcblk\d+|vd[a-z]+)$/, 'Invalid device path'),
  role: z.enum(['data', 'parity', 'cache']),
})

const SetupPoolSchema = z.object({
  disks:    z.array(DiskConfigSchema).min(1),
  fsType:   z.enum(['ext4', 'xfs']),
  poolType: z.enum(['single', 'mergerfs', 'snapraid']),
})

export async function setupRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  // ── Status ─────────────────────────────────────────────────────────────────
  // GET /api/setup/status — no auth required (checked before login)
  fastify.get('/status', async (_request, reply) => {
    const value = getSetting(fastify.db, 'setup_complete')
    return reply.send({ complete: value === '1' })
  })

  // ── Auto-login ─────────────────────────────────────────────────────────────
  // POST /api/setup/autologin — creates a session for admin without password.
  // Only works while setup_complete is not set. Allows the wizard to run
  // without showing a login screen to the user.
  fastify.post('/autologin', {
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
  }, async (_request, reply) => {
    if (getSetting(fastify.db, 'setup_complete') === '1') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Setup already completed' })
    }
    // Permanently locked once setup was ever completed — blocks autologin even if
    // setup_complete is manually cleared (e.g. via the reset wizard command).
    if (getSetting(fastify.db, 'setup_ever_completed') === '1') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Setup already completed on this device' })
    }

    const usersRepo = createUsersRepo(fastify.db)
    const admin = usersRepo.findFirstAdmin()
    if (!admin) {
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Admin user not found' })
    }

    const sessionId = randomUUID()
    const csrfToken = randomUUID()
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS

    const sessionsRepo = createSessionsRepo(fastify.db)
    sessionsRepo.create({ id: sessionId, userId: admin.id, csrfToken, expiresAt })

    return reply.send({
      sessionId,
      csrfToken,
      user: { id: admin.id, username: admin.username, role: admin.role },
    })
  })

  // ── Account (username + password) ─────────────────────────────────────────
  // POST /api/setup/account — change username AND password in one step
  fastify.post('/account', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    if (getSetting(fastify.db, 'setup_complete') === '1') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Setup already completed' })
    }

    const result = SetupAccountSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Bad Request', message: result.error.errors[0]?.message ?? result.error.message })
    }

    const usersRepo = createUsersRepo(fastify.db)

    // Check username not taken by another user
    const existing = usersRepo.findByUsername(result.data.username)
    if (existing && existing.id !== request.user.id) {
      return reply.status(409).send({ error: 'Conflict', message: 'El nombre de usuario ya está en uso' })
    }

    usersRepo.updateUsername(request.user.id, result.data.username)
    const newHash = await bcryptjs.hash(result.data.newPassword, BCRYPT_ROUNDS)
    usersRepo.updatePassword(request.user.id, newHash)

    // Create Samba user in background — non-fatal if Samba not installed
    setupSambaUser(result.data.username, result.data.newPassword).catch(() => {})

    // Update the current session user info in the response
    return reply.send({ ok: true, username: result.data.username })
  })

  // ── Password (legacy, kept for compat) ────────────────────────────────────
  fastify.post('/password', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    if (getSetting(fastify.db, 'setup_complete') === '1') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Setup already completed' })
    }
    const result = SetupPasswordSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Bad Request', message: result.error.errors[0]?.message ?? result.error.message })
    }
    const usersRepo = createUsersRepo(fastify.db)
    const newHash = await bcryptjs.hash(result.data.newPassword, BCRYPT_ROUNDS)
    usersRepo.updatePassword(request.user.id, newHash)
    return reply.send({ ok: true })
  })

  // ── Network info ───────────────────────────────────────────────────────────
  // GET /api/setup/network — returns current interfaces and their config
  fastify.get('/network', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    if (getSetting(fastify.db, 'setup_complete') === '1') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Setup already completed' })
    }
    try {
      const info = await getNetworkInfo()
      return reply.send(info)
    } catch (err) {
      return reply.status(500).send({ error: 'Internal Server Error', message: (err as Error).message })
    }
  })

  // POST /api/setup/network — configure DHCP or static IP
  fastify.post('/network', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    if (getSetting(fastify.db, 'setup_complete') === '1') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Setup already completed' })
    }

    const parsed = SetupNetworkSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Bad Request', message: parsed.error.errors[0]?.message ?? parsed.error.message })
    }

    try {
      await configureNetwork(parsed.data)
      return reply.send({ ok: true })
    } catch (err) {
      return reply.status(500).send({ error: 'Internal Server Error', message: (err as Error).message })
    }
  })

  // ── Storage pool ───────────────────────────────────────────────────────────
  // POST /api/setup/pool — format disks and configure storage pool
  fastify.post('/pool', {
    preHandler: [requireAuth, requireAdmin],
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } }, // destructive op
  }, async (request, reply) => {
    if (getSetting(fastify.db, 'setup_complete') === '1') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Setup already completed' })
    }

    const parsed = SetupPoolSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Bad Request', message: parsed.error.errors[0]?.message ?? parsed.error.message })
    }

    try {
      await configurePool(parsed.data)
      return reply.send({ ok: true })
    } catch (err) {
      return reply.status(500).send({ error: 'Storage Error', message: (err as Error).message })
    }
  })

  // ── Complete ───────────────────────────────────────────────────────────────
  fastify.post('/complete', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    setSetting(fastify.db, 'setup_complete', '1')
    setSetting(fastify.db, 'setup_ever_completed', '1') // permanent — survives setup resets
    fastify.db.prepare(`INSERT INTO audit_log (user_id, username, action, ip) VALUES (?, ?, 'setup_complete', ?)`)
      .run(request.user.id, request.user.username, request.ip)
    // Fix pool permissions so the Samba user can write — non-fatal
    fixPoolPermissions().catch(() => {})
    return reply.send({ complete: true })
  })
}
