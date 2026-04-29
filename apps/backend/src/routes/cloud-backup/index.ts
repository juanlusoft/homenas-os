import type { FastifyInstance } from 'fastify'
import { createCloudBackupService } from '../../services/cloud-backup.service.js'
import type { RemoteType, JobOperation } from '../../services/cloud-backup.service.js'

const VALID_REMOTE_TYPES = new Set<RemoteType>([
  'gdrive', 'dropbox', 'onedrive', 's3', 'b2', 'mega', 'sftp', 'ftp', 'webdav',
])

const VALID_OPERATIONS = new Set<JobOperation>(['sync', 'copy', 'move'])

export async function cloudBackupRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  function svc() {
    return createCloudBackupService(fastify.db)
  }

  // ─── Status / Install ────────────────────────────────────────────────────────

  // GET /api/cloud-backup/status
  fastify.get('/status', { preHandler: [requireAuth] }, async (_req, reply) => {
    try {
      const status = await svc().getStatus()
      return reply.send(status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/cloud-backup/install
  fastify.post('/install', { preHandler: [requireAuth, requireAdmin] }, async (_req, reply) => {
    try {
      await svc().installRclone()
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // ─── Remotes ─────────────────────────────────────────────────────────────────

  // GET /api/cloud-backup/remotes — admin only (contains credentials)
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/remotes', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    try {
      const limit = Math.min(parseInt(req.query.limit ?? '50', 10) || 50, 200)
      const offset = parseInt(req.query.offset ?? '0', 10) || 0
      const { items, total } = svc().listRemotes(limit, offset)
      return reply.send({ items: items.map(({ configParsed: _c, ...rest }) => rest), total, limit, offset })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/cloud-backup/remotes
  fastify.post('/remotes', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const type = typeof body?.type === 'string' ? body.type.trim() : ''
    const config = body?.config && typeof body.config === 'object' && !Array.isArray(body.config)
      ? (body.config as Record<string, string>)
      : null

    if (!name) {
      return reply.status(400).send({ error: 'Bad Request', message: 'name is required' })
    }
    if (!type || !VALID_REMOTE_TYPES.has(type as RemoteType)) {
      return reply.status(400).send({ error: 'Bad Request', message: `type must be one of: ${[...VALID_REMOTE_TYPES].join(', ')}` })
    }
    if (!config) {
      return reply.status(400).send({ error: 'Bad Request', message: 'config object is required' })
    }

    try {
      const remote = svc().configureRemote(name, type as RemoteType, config)
      return reply.status(201).send(remote)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(400).send({ error: 'Bad Request', message })
    }
  })

  // DELETE /api/cloud-backup/remotes/:name
  fastify.delete('/remotes/:name', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { name } = req.params as { name: string }
    if (!name) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Remote name is required' })
    }
    try {
      svc().deleteRemote(name)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // GET /api/cloud-backup/remotes/:name/info
  fastify.get('/remotes/:name/info', { preHandler: [requireAuth] }, async (req, reply) => {
    const { name } = req.params as { name: string }
    try {
      const info = await svc().getRemoteInfo(name)
      return reply.send(info)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // ─── Jobs ────────────────────────────────────────────────────────────────────

  // GET /api/cloud-backup/jobs
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/jobs', { preHandler: [requireAuth] }, async (req, reply) => {
    try {
      const limit = Math.min(parseInt(req.query.limit ?? '50', 10) || 50, 200)
      const offset = parseInt(req.query.offset ?? '0', 10) || 0
      return reply.send({ ...svc().listJobs(limit, offset), limit, offset })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/cloud-backup/jobs
  fastify.post('/jobs', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const remote_id = typeof body?.remote_id === 'number' ? body.remote_id : null
    const operation = typeof body?.operation === 'string' ? body.operation : ''
    const source = typeof body?.source === 'string' ? body.source.trim() : ''
    const destination = typeof body?.destination === 'string' ? body.destination.trim() : ''
    const cron_expression = typeof body?.cron_expression === 'string' ? body.cron_expression : null
    const enabled = typeof body?.enabled === 'number' ? body.enabled : 1

    if (!name || !remote_id || !operation || !source || !destination) {
      return reply.status(400).send({ error: 'Bad Request', message: 'name, remote_id, operation, source, and destination are required' })
    }
    if (!VALID_OPERATIONS.has(operation as JobOperation)) {
      return reply.status(400).send({ error: 'Bad Request', message: `operation must be one of: ${[...VALID_OPERATIONS].join(', ')}` })
    }

    try {
      const job = svc().createJob({ name, remote_id, operation: operation as JobOperation, source, destination, cron_expression, enabled })
      return reply.status(201).send(job)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message === 'Remote not found' ? 404 : 400
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Bad Request', message })
    }
  })

  // PUT /api/cloud-backup/jobs/:id
  fastify.put('/jobs/:id', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const jobId = parseInt(id, 10)
    if (isNaN(jobId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid job ID' })
    }

    const body = req.body as Record<string, unknown>
    const patch: Record<string, unknown> = {}

    if (typeof body?.name === 'string') patch.name = body.name.trim()
    if (typeof body?.operation === 'string') {
      if (!VALID_OPERATIONS.has(body.operation as JobOperation)) {
        return reply.status(400).send({ error: 'Bad Request', message: `operation must be one of: ${[...VALID_OPERATIONS].join(', ')}` })
      }
      patch.operation = body.operation
    }
    if (typeof body?.source === 'string') patch.source = body.source.trim()
    if (typeof body?.destination === 'string') patch.destination = body.destination.trim()
    if ('cron_expression' in body) patch.cron_expression = body.cron_expression ?? null
    if (typeof body?.enabled === 'number') patch.enabled = body.enabled

    try {
      const job = svc().updateJob(jobId, patch)
      return reply.send(job)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message === 'Job not found' ? 404 : 400
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Bad Request', message })
    }
  })

  // DELETE /api/cloud-backup/jobs/:id
  fastify.delete('/jobs/:id', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const jobId = parseInt(id, 10)
    if (isNaN(jobId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid job ID' })
    }
    try {
      svc().deleteJob(jobId)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message === 'Job not found' ? 404 : 400
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Bad Request', message })
    }
  })

  // POST /api/cloud-backup/jobs/:id/run
  fastify.post('/jobs/:id/run', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const jobId = parseInt(id, 10)
    if (isNaN(jobId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid job ID' })
    }
    try {
      const result = svc().startTransfer(jobId)
      return reply.status(202).send(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message === 'Job not found' ? 404 : message.includes('already running') ? 409 : 400
      const errName = status === 404 ? 'Not Found' : status === 409 ? 'Conflict' : 'Bad Request'
      return reply.status(status).send({ error: errName, message })
    }
  })

  // ─── Transfer ────────────────────────────────────────────────────────────────

  // GET /api/cloud-backup/transfer/progress
  fastify.get('/transfer/progress', { preHandler: [requireAuth] }, async (_req, reply) => {
    try {
      return reply.send(svc().getTransferProgress())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/cloud-backup/transfer/cancel
  fastify.post('/transfer/cancel', { preHandler: [requireAuth, requireAdmin] }, async (_req, reply) => {
    try {
      svc().cancelTransfer()
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(409).send({ error: 'Conflict', message })
    }
  })

  // ─── History ─────────────────────────────────────────────────────────────────

  // GET /api/cloud-backup/transfers (history)
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/transfers', { preHandler: [requireAuth] }, async (req, reply) => {
    try {
      const limit = Math.min(parseInt(req.query.limit ?? '50', 10) || 50, 200)
      const offset = parseInt(req.query.offset ?? '0', 10) || 0
      return reply.send({ ...svc().listTransfers(limit, offset), limit, offset })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })
}
