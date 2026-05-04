import type { FastifyInstance } from 'fastify'
import {
  checkForUpdates,
  updateApp,
  updateOs,
  getUpdateProcessState,
  getAutoUpdateConfig,
  setAutoUpdateConfig,
} from '../../services/updates.service.js'

// Simple in-process rate limiting (per update type)
const lastAppUpdate: { at: number } = { at: 0 }
const lastOsUpdate: { at: number } = { at: 0 }
const RATE_LIMIT_SECONDS = 60 * 60  // 1 hour

export async function updatesRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  // GET /api/updates/status — check for available updates + current process state
  fastify.get('/status', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    try {
      const status = await checkForUpdates()
      return reply.send(status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Error', message })
    }
  })

  // POST /api/updates/app — update application (rate limit: 1/hour)
  fastify.post('/app', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    const nowSeconds = Math.floor(Date.now() / 1000)
    if (lastAppUpdate.at > 0 && nowSeconds - lastAppUpdate.at < RATE_LIMIT_SECONDS) {
      const remaining = RATE_LIMIT_SECONDS - (nowSeconds - lastAppUpdate.at)
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: `App updates are rate-limited. Try again in ${Math.ceil(remaining / 60)} minutes.`,
      })
    }

    try {
      updateApp()
      lastAppUpdate.at = nowSeconds
      return reply.status(202).send({ ok: true, message: 'App update started' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('already in progress') ? 409 : 500
      return reply.status(status).send({ error: status === 409 ? 'Conflict' : 'Error', message })
    }
  })

  // POST /api/updates/os — update OS packages (rate limit: 1/hour)
  // body: { packages?: string[] }
  fastify.post('/os', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const body = request.body as { packages?: unknown }
    const packages: string[] = []

    if (body?.packages !== undefined) {
      if (!Array.isArray(body.packages)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'packages must be an array of strings' })
      }
      for (const pkg of body.packages) {
        if (typeof pkg !== 'string' || !/^[a-zA-Z0-9._+\-]+$/.test(pkg)) {
          return reply.status(400).send({ error: 'Bad Request', message: `Invalid package name: ${pkg}` })
        }
        packages.push(pkg)
      }
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    if (lastOsUpdate.at > 0 && nowSeconds - lastOsUpdate.at < RATE_LIMIT_SECONDS) {
      const remaining = RATE_LIMIT_SECONDS - (nowSeconds - lastOsUpdate.at)
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: `OS updates are rate-limited. Try again in ${Math.ceil(remaining / 60)} minutes.`,
      })
    }

    try {
      updateOs(packages)
      lastOsUpdate.at = nowSeconds
      return reply.status(202).send({ ok: true, message: 'OS update started' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('already in progress') ? 409 : 500
      return reply.status(status).send({ error: status === 409 ? 'Conflict' : 'Error', message })
    }
  })

  // GET /api/updates/process — live process state (poll for output)
  fastify.get('/process', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    return reply.send(getUpdateProcessState())
  })

  // GET /api/updates/auto — auto-update config + last check/apply times
  fastify.get('/auto', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    return reply.send(getAutoUpdateConfig())
  })

  // POST /api/updates/auto — enable/disable + set interval
  // body: { enabled: boolean, intervalMinutes: number }
  fastify.post('/auto', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const body = request.body as { enabled?: unknown; intervalMinutes?: unknown }
    if (typeof body?.enabled !== 'boolean') {
      return reply.status(400).send({ error: 'Bad Request', message: 'enabled must be boolean' })
    }
    const intervalMinutes = typeof body.intervalMinutes === 'number'
      ? Math.max(5, Math.min(1440, body.intervalMinutes))
      : 30
    setAutoUpdateConfig({ enabled: body.enabled, intervalMinutes })
    return reply.send(getAutoUpdateConfig())
  })
}
