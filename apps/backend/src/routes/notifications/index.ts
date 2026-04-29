import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  getEmailConfig,
  saveEmailConfig,
  getTelegramConfig,
  saveTelegramConfig,
  sendAlert,
} from '../../services/notifications.service.js'
import { getSetting, setSetting } from '../../lib/settings.js'

const EmailConfigSchema = z.object({
  enabled:  z.boolean().optional(),
  host:     z.string().max(253).optional(),
  port:     z.number().int().min(1).max(65535).optional(),
  secure:   z.boolean().optional(),
  user:     z.string().max(254).optional(),
  password: z.string().max(512).optional(),
  from:     z.string().max(254).optional(),
  to:       z.string().max(512).optional(),
})

const TelegramConfigSchema = z.object({
  enabled: z.boolean().optional(),
  token:   z.string().max(256).optional(),
  chatId:  z.string().max(64).optional(),
})

export async function notificationsRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  // GET /api/notifications/config — email + telegram config (passwords/tokens redacted)
  fastify.get('/config', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    return reply.send({
      email:    getEmailConfig(fastify.db),
      telegram: getTelegramConfig(fastify.db),
      onLogin:  getSetting(fastify.db, 'notif_on_login') === '1',
    })
  })

  // PUT /api/notifications/email — update email config
  fastify.put('/email', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const parsed = EmailConfigSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Bad Request', message: parsed.error.errors[0]?.message })
    }
    saveEmailConfig(fastify.db, parsed.data)
    return reply.send({ ok: true })
  })

  // PUT /api/notifications/telegram — update Telegram config
  fastify.put('/telegram', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const parsed = TelegramConfigSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Bad Request', message: parsed.error.errors[0]?.message })
    }
    saveTelegramConfig(fastify.db, parsed.data)
    return reply.send({ ok: true })
  })

  // PUT /api/notifications/settings — misc alert toggles (e.g. notif_on_login)
  fastify.put('/settings', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const parsed = z.object({ onLogin: z.boolean().optional() }).safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Bad Request', message: parsed.error.errors[0]?.message })
    }
    if (parsed.data.onLogin !== undefined) {
      setSetting(fastify.db, 'notif_on_login', parsed.data.onLogin ? '1' : '0')
    }
    return reply.send({ ok: true })
  })

  // POST /api/notifications/test — send a test notification via all enabled channels
  fastify.post('/test', {
    preHandler: [requireAuth, requireAdmin],
    config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
  }, async (_request, reply) => {
    await sendAlert(
      fastify.db,
      'info',
      'Notificación de prueba',
      'Esta es una notificación de prueba desde HomeNas OS. Si la recibes, la configuración es correcta.',
    )
    return reply.send({ ok: true })
  })
}
