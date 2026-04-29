import type { FastifyInstance } from 'fastify'
import {
  getStatus,
  configure,
  remove,
  getPublicIp,
  updateDns,
} from '../../services/ddns.service.js'
import type { DdnsProvider } from '../../services/ddns.service.js'

const VALID_PROVIDERS: DdnsProvider[] = ['duckdns', 'noip', 'cloudflare', 'dynu']

export async function ddnsRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  // GET /api/ddns/status — any auth user, tokens redacted
  fastify.get('/status', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    const configs = getStatus(fastify.db)
    const redacted = configs.map(({ token: _t, username: _u, ...rest }) => rest)
    return reply.send(redacted)
  })

  // GET /api/ddns/configs — admin only, full data including tokens
  fastify.get('/configs', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    const configs = getStatus(fastify.db)
    return reply.send(configs)
  })

  // POST /api/ddns/configs
  fastify.post('/configs', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const body = request.body as {
      provider?: unknown
      domain?: unknown
      token?: unknown
      username?: unknown
      enabled?: unknown
    }

    if (!body || typeof body.provider !== 'string' || !VALID_PROVIDERS.includes(body.provider as DdnsProvider)) {
      return reply.status(400).send({ error: 'Bad Request', message: `provider must be one of: ${VALID_PROVIDERS.join(', ')}` })
    }
    if (typeof body.domain !== 'string' || !body.domain.trim()) {
      return reply.status(400).send({ error: 'Bad Request', message: 'domain is required' })
    }
    if (typeof body.token !== 'string' || !body.token.trim()) {
      return reply.status(400).send({ error: 'Bad Request', message: 'token is required' })
    }

    try {
      const config = configure(fastify.db, {
        provider: body.provider as DdnsProvider,
        domain: body.domain.trim(),
        token: body.token.trim(),
        username: typeof body.username === 'string' ? body.username.trim() || undefined : undefined,
        enabled: body.enabled !== false,
      })
      return reply.status(201).send(config)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(400).send({ error: 'Bad Request', message })
    }
  })

  // DELETE /api/ddns/configs/:id
  fastify.delete('/configs/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const configId = parseInt(id, 10)
    if (isNaN(configId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid ID' })
    }

    try {
      remove(fastify.db, configId)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('not found') ? 404 : 500
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Error', message })
    }
  })

  // POST /api/ddns/update-now — force immediate update
  fastify.post('/update-now', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    try {
      const ip = await getPublicIp()
      const configs = getStatus(fastify.db)
      const results: Array<{ id: number; domain: string; status: string }> = []

      for (const config of configs) {
        if (!config.enabled) continue
        const now = Math.floor(Date.now() / 1000)
        try {
          await updateDns(config, ip)
          fastify.db.prepare(`
            UPDATE ddns_config SET last_update = ?, last_ip = ?, last_status = ? WHERE id = ?
          `).run(now, ip, 'ok', config.id)
          results.push({ id: config.id, domain: config.domain, status: 'ok' })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown'
          fastify.db.prepare(`
            UPDATE ddns_config SET last_update = ?, last_status = ? WHERE id = ?
          `).run(now, `error: ${msg.slice(0, 200)}`, config.id)
          results.push({ id: config.id, domain: config.domain, status: `error: ${msg}` })
        }
      }

      return reply.send({ ip, results })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Error', message })
    }
  })
}
