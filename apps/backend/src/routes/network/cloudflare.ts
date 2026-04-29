import type { FastifyInstance } from 'fastify'
import { CloudflareConfigSchema } from '@homenas/shared'
import {
  getStatus,
  install,
  isInstalled,
  configure,
  start,
  stop,
  remove,
} from '../../services/cloudflare.service.js'

export async function cloudflareRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  // GET /api/network/cloudflare/status
  fastify.get('/status', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    try {
      const status = await getStatus(fastify.db)
      return reply.send(status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/network/cloudflare/configure
  fastify.post('/configure', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const result = CloudflareConfigSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Bad Request', message: result.error.message })
    }

    const { token } = result.data

    try {
      // Install cloudflared binary if not already present
      if (!isInstalled()) {
        await install()
      }

      // Configure service with the provided token
      await configure(fastify.db, token)

      // Start the service
      await start(fastify.db)

      // Return updated status
      const status = await getStatus(fastify.db)
      return reply.send(status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/network/cloudflare/start
  fastify.post('/start', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    try {
      await start(fastify.db)
      const status = await getStatus(fastify.db)
      return reply.send(status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/network/cloudflare/stop
  fastify.post('/stop', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    try {
      await stop(fastify.db)
      const status = await getStatus(fastify.db)
      return reply.send(status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/network/cloudflare/remove
  fastify.post('/remove', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    try {
      await remove(fastify.db)
      const status = await getStatus(fastify.db)
      return reply.send(status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })
}
