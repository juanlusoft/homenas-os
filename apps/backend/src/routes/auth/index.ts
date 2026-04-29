import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import bcryptjs from 'bcryptjs'
import { TOTP, Secret } from 'otpauth'
import { LoginSchema } from '@homenas/shared'
import { createUsersRepo } from '../../repositories/users.repo.js'
import { createSessionsRepo } from '../../repositories/sessions.repo.js'
import { getSetting } from '../../lib/settings.js'
import { sendAlert } from '../../services/notifications.service.js'
import { totpRoutes } from './totp.js'

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

// Dummy hash used when user is not found — ensures bcrypt always runs to prevent timing attacks
const DUMMY_HASH = '$2a$12$invalidhashusedfortimingprotection00000000000000000000000'

export async function authRoutes(fastify: FastifyInstance) {
  const { requireAuth } = fastify

  // POST /api/auth/login — strict rate limit: 10 attempts per 15 minutes per IP
  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const result = LoginSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Bad Request', message: result.error.message })
    }

    // Block login until setup wizard is complete
    if (getSetting(fastify.db, 'setup_complete') !== '1') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Setup not completed' })
    }

    const { username, password } = result.data
    const ip = request.ip ?? 'unknown'

    // Account lockout: max 5 failed attempts per username in 15 minutes
    const LOCKOUT_WINDOW = 15 * 60 // seconds
    const MAX_ATTEMPTS = 5
    const since = Math.floor(Date.now() / 1000) - LOCKOUT_WINDOW
    const failCount = (fastify.db.prepare(
      `SELECT COUNT(*) as n FROM login_attempts WHERE username = ? AND success = 0 AND created_at > ?`
    ).get(username, since) as { n: number }).n

    if (failCount >= MAX_ATTEMPTS) {
      // Alert on the lockout threshold crossing (not every blocked attempt)
      if (failCount === MAX_ATTEMPTS) {
        void sendAlert(fastify.db, 'error',
          'Cuenta bloqueada por intentos fallidos',
          `La cuenta "${username}" ha sido bloqueada temporalmente tras ${MAX_ATTEMPTS} intentos fallidos desde ${ip}.`
        )
      }
      return reply.status(429).send({ error: 'Too Many Requests', message: 'Account temporarily locked. Try again in 15 minutes.' })
    }

    const usersRepo = createUsersRepo(fastify.db)
    const user = usersRepo.findByUsername(username)

    // Always run bcrypt even when user not found — prevents username enumeration via timing
    const hashToCompare = user?.passwordHash ?? DUMMY_HASH
    const passwordValid = await bcryptjs.compare(password, hashToCompare)

    // Record attempt
    fastify.db.prepare(
      `INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, ?)`
    ).run(username, ip, passwordValid && user ? 1 : 0)

    if (!user || !passwordValid) {
      // Alert when account is about to be locked (attempt that would reach threshold)
      const newFailCount = failCount + 1
      if (newFailCount >= MAX_ATTEMPTS) {
        void sendAlert(fastify.db, 'error',
          'Cuenta bloqueada por intentos fallidos',
          `La cuenta "${username}" ha sido bloqueada temporalmente tras ${MAX_ATTEMPTS} intentos fallidos desde ${ip}.`
        )
      }
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' })
    }

    // 2FA check: if TOTP is enabled, require totpCode in request body
    if (user.totpEnabled) {
      const totpCode = result.data.totpCode
      if (!totpCode) {
        return reply.status(401).send({ error: 'Unauthorized', requireTotp: true, message: 'TOTP code required' })
      }
      if (!user.totpSecret) {
        return reply.status(500).send({ error: 'Internal Server Error', message: 'TOTP misconfigured' })
      }
      const totp = new TOTP({ secret: Secret.fromBase32(user.totpSecret), algorithm: 'SHA1', digits: 6, period: 30 })
      if (totp.validate({ token: totpCode.replace(/\s/g, ''), window: 1 }) === null) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid TOTP code' })
      }
    }

    // Log successful login to audit log
    fastify.db.prepare(
      `INSERT INTO audit_log (user_id, username, action, ip) VALUES (?, ?, 'login', ?)`
    ).run(user.id, user.username, ip)

    // Alert on login if enabled in notification settings
    if (getSetting(fastify.db, 'notif_on_login') === '1') {
      void sendAlert(fastify.db, 'info',
        'Inicio de sesión',
        `El usuario "${user.username}" ha iniciado sesión desde ${ip}.`
      )
    }

    const sessionId = randomUUID()
    const csrfToken = randomUUID()
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS

    const sessionsRepo = createSessionsRepo(fastify.db)
    sessionsRepo.create({ id: sessionId, userId: user.id, csrfToken, expiresAt })

    return reply.status(200).send({
      sessionId,
      csrfToken,
      user: { id: user.id, username: user.username, role: user.role },
    })
  })

  // POST /api/auth/logout
  fastify.post('/logout', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const sessionId = request.headers['x-session-id'] as string
    const sessionsRepo = createSessionsRepo(fastify.db)
    sessionsRepo.delete(sessionId)
    return reply.send({ ok: true })
  })

  // GET /api/auth/me
  fastify.get('/me', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id, username, role } = request.user
    return reply.send({ id, username, role })
  })

  // 2FA / TOTP routes
  fastify.register(totpRoutes)
}
