import type { FastifyInstance } from 'fastify'
import bcryptjs from 'bcryptjs'
import { TOTP, Secret } from 'otpauth'
import qrcode from 'qrcode'
import { z } from 'zod'
import { createUsersRepo } from '../../repositories/users.repo.js'
import { sendAlert } from '../../services/notifications.service.js'

export async function totpRoutes(fastify: FastifyInstance) {
  const { requireAuth } = fastify

  // GET /api/auth/totp/status — returns whether TOTP is enabled for the current user
  fastify.get('/totp/status', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const usersRepo = createUsersRepo(fastify.db)
    const user = usersRepo.findById(request.user.id)
    return reply.send({ enabled: user?.totpEnabled ?? false })
  })

  // POST /api/auth/totp/setup — generate a new TOTP secret and QR code
  // Does NOT enable TOTP yet — user must verify with /totp/enable
  fastify.post('/totp/setup', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const usersRepo = createUsersRepo(fastify.db)
    const user = usersRepo.findById(request.user.id)
    if (!user) return reply.status(404).send({ error: 'Not Found', message: 'User not found' })
    if (user.totpEnabled) {
      return reply.status(409).send({ error: 'Conflict', message: 'TOTP already enabled — disable it first' })
    }

    const secret = new Secret()
    const totp = new TOTP({ issuer: 'HomeNas', label: user.username, algorithm: 'SHA1', digits: 6, period: 30, secret })
    const uri = totp.toString()
    const qrDataUrl = await qrcode.toDataURL(uri, { width: 200, margin: 2 })

    // Persist secret (not enabled yet — user must confirm with a valid code)
    usersRepo.setTotpSecret(user.id, secret.base32)

    return reply.send({ secret: secret.base32, uri, qrDataUrl })
  })

  // POST /api/auth/totp/enable — verify a TOTP code and activate 2FA
  fastify.post('/totp/enable', {
    preHandler: [requireAuth],
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    const parsed = z.object({ code: z.string().length(6).regex(/^\d{6}$/) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Bad Request', message: 'code must be exactly 6 digits' })
    }

    const usersRepo = createUsersRepo(fastify.db)
    const user = usersRepo.findById(request.user.id)
    if (!user?.totpSecret) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Run /totp/setup first' })
    }

    const totp = new TOTP({ secret: Secret.fromBase32(user.totpSecret), algorithm: 'SHA1', digits: 6, period: 30 })
    if (totp.validate({ token: parsed.data.code, window: 1 }) === null) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid TOTP code' })
    }

    usersRepo.enableTotp(user.id)
    fastify.db.prepare(`INSERT INTO audit_log (user_id, username, action, ip) VALUES (?, ?, 'totp_enabled', ?)`)
      .run(request.user.id, request.user.username, request.ip)

    void sendAlert(fastify.db, 'info', '2FA activado', `El usuario ${user.username} ha activado la autenticación de dos factores.`)

    return reply.send({ ok: true })
  })

  // POST /api/auth/totp/disable — verify current password and deactivate 2FA
  fastify.post('/totp/disable', {
    preHandler: [requireAuth],
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    const parsed = z.object({ password: z.string().min(1) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Bad Request', message: 'password is required' })
    }

    const usersRepo = createUsersRepo(fastify.db)
    const user = usersRepo.findById(request.user.id)
    if (!user) return reply.status(404).send({ error: 'Not Found', message: 'User not found' })

    const valid = await bcryptjs.compare(parsed.data.password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid password' })
    }

    usersRepo.disableTotp(user.id)
    fastify.db.prepare(`INSERT INTO audit_log (user_id, username, action, ip) VALUES (?, ?, 'totp_disabled', ?)`)
      .run(request.user.id, request.user.username, request.ip)

    void sendAlert(fastify.db, 'warning', '2FA desactivado', `El usuario ${user.username} ha desactivado la autenticación de dos factores.`)

    return reply.send({ ok: true })
  })
}
