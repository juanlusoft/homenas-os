import type { FastifyInstance } from 'fastify'
import { InstallPayloadSchema, UninstallPayloadSchema } from '@homenas/shared'
import {
  getCatalog,
  installApp,
  uninstallApp,
  startApp,
  stopApp,
  restartApp,
  updateApp,
  getAppLogs,
} from '../../services/homestore.service.js'

// Shared rate-limit config for destructive / heavy operations
const heavyRateLimit = {
  config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
}

export async function homestoreRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  // ── GET /api/homestore/catalog ──────────────────────────────────────────────

  fastify.get('/catalog', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    try {
      const catalog = await getCatalog()
      return reply.send(catalog)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // ── POST /api/homestore/install/:id ────────────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/install/:id', {
    preHandler: [requireAuth, requireAdmin],
    ...heavyRateLimit,
  }, async (request, reply) => {
    const { id } = request.params

    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid app ID' })
    }

    const parsed = InstallPayloadSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Bad Request', message: parsed.error.message })
    }

    try {
      await installApp(id, parsed.data)
      return reply.status(201).send({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('not found') ? 404 : message.includes('already installed') ? 409 : 500
      return reply.status(status).send({ error: status === 500 ? 'Internal Server Error' : 'Error', message })
    }
  })

  // ── POST /api/homestore/uninstall/:id ──────────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/uninstall/:id', {
    preHandler: [requireAuth, requireAdmin],
    ...heavyRateLimit,
  }, async (request, reply) => {
    const { id } = request.params

    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid app ID' })
    }

    const parsed = UninstallPayloadSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Bad Request', message: parsed.error.message })
    }

    try {
      await uninstallApp(id, parsed.data.removeData)
      return reply.send({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('not installed') ? 404 : 500
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Internal Server Error', message })
    }
  })

  // ── POST /api/homestore/start/:id ──────────────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/start/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params

    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid app ID' })
    }

    try {
      await startApp(id)
      return reply.send({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('not installed') ? 404 : 500
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Internal Server Error', message })
    }
  })

  // ── POST /api/homestore/stop/:id ───────────────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/stop/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params

    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid app ID' })
    }

    try {
      await stopApp(id)
      return reply.send({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('not installed') ? 404 : 500
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Internal Server Error', message })
    }
  })

  // ── POST /api/homestore/restart/:id ───────────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/restart/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params

    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid app ID' })
    }

    try {
      await restartApp(id)
      return reply.send({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('not installed') ? 404 : 500
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Internal Server Error', message })
    }
  })

  // ── POST /api/homestore/update/:id ────────────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/update/:id', {
    preHandler: [requireAuth, requireAdmin],
    ...heavyRateLimit,
  }, async (request, reply) => {
    const { id } = request.params

    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid app ID' })
    }

    try {
      await updateApp(id)
      return reply.send({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('not installed') ? 404 : 500
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Internal Server Error', message })
    }
  })

  // ── GET /api/homestore/logs/:id ────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/logs/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params

    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid app ID' })
    }

    try {
      const logs = await getAppLogs(id)
      return reply.send({ id, logs })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('not installed') ? 404 : 500
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Internal Server Error', message })
    }
  })
}
