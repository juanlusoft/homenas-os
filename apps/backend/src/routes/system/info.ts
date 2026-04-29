import type { FastifyInstance } from 'fastify'
import {
  getSystemInfo,
  getUpsStatus,
  getNotifications,
  markNotificationAsRead,
} from '../../services/system-info.service.js'
import { getEntries, clearEntries, type LogLevel } from '../../lib/log-store.js'

export async function systemInfoRoutes(fastify: FastifyInstance) {
  const { requireAuth } = fastify

  // GET /api/system/info
  fastify.get('/info', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    const info = await getSystemInfo()
    return reply.send(info)
  })

  // GET /api/system/ups
  fastify.get('/ups', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    const ups = await getUpsStatus()
    return reply.send(ups)
  })

  // GET /api/system/notifications
  fastify.get('/notifications', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    const notifications = getNotifications(fastify.db)
    return reply.send(notifications)
  })

  // POST /api/system/notifications/:id/read
  fastify.post('/notifications/:id/read', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = parseInt(id, 10)
    if (isNaN(numId)) {
      return reply.status(400).send({ error: 'Invalid notification id' })
    }
    const updated = markNotificationAsRead(fastify.db, numId)
    if (!updated) {
      return reply.status(404).send({ error: 'Notification not found' })
    }
    return reply.send({ ok: true })
  })

  // GET /api/system/logs?level=error&ctx=upload&limit=100
  fastify.get('/logs', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const q = request.query as { level?: string; ctx?: string; limit?: string }
    const validLevels: LogLevel[] = ['info', 'warn', 'error']
    const level = validLevels.includes(q.level as LogLevel) ? (q.level as LogLevel) : undefined
    const ctx = typeof q.ctx === 'string' && q.ctx ? q.ctx : undefined
    const limit = q.limit ? Math.min(parseInt(q.limit, 10) || 100, 500) : 100
    return reply.send(getEntries({ level, ctx, limit }))
  })

  // DELETE /api/system/logs — clear the in-memory log buffer
  fastify.delete('/logs', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    clearEntries()
    return reply.send({ ok: true })
  })
}
