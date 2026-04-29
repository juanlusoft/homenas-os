import type { FastifyInstance } from 'fastify'
import { createNetworkDrivesService } from '../../services/network-drives.service.js'
import type { DriveType } from '../../services/network-drives.service.js'

const VALID_TYPES = new Set<DriveType>(['webdav', 'sftp', 's3', 'smb', 'ftp', 'b2'])

export async function networkDrivesRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  function svc() {
    return createNetworkDrivesService(fastify.db)
  }

  // GET /api/network-drives
  fastify.get('/', { preHandler: [requireAuth] }, async (_req, reply) => {
    try {
      return reply.send({ items: svc().listDrives() })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/network-drives
  fastify.post('/', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const name   = typeof body?.name === 'string' ? body.name.trim() : ''
    const type   = typeof body?.type === 'string' ? body.type.trim() : ''
    const config = body?.config && typeof body.config === 'object' && !Array.isArray(body.config)
      ? (body.config as Record<string, string>)
      : null
    const autoMount = body?.auto_mount === true

    if (!name) return reply.status(400).send({ error: 'Bad Request', message: 'name is required' })
    if (!type || !VALID_TYPES.has(type as DriveType)) {
      return reply.status(400).send({ error: 'Bad Request', message: `type must be one of: ${[...VALID_TYPES].join(', ')}` })
    }
    if (!config) return reply.status(400).send({ error: 'Bad Request', message: 'config object is required' })

    try {
      const drive = await svc().addDrive(name, type as DriveType, config, autoMount)
      return reply.status(201).send(drive)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(400).send({ error: 'Bad Request', message })
    }
  })

  // DELETE /api/network-drives/:id
  fastify.delete('/:id', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const driveId = parseInt(id, 10)
    if (isNaN(driveId)) return reply.status(400).send({ error: 'Bad Request', message: 'Invalid ID' })

    try {
      await svc().deleteDrive(driveId)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message === 'Drive not found' ? 404 : 500
      return reply.status(status).send({
        error: status === 404 ? 'Not Found' : 'Internal Server Error',
        message,
      })
    }
  })

  // POST /api/network-drives/:id/mount
  fastify.post('/:id/mount', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const driveId = parseInt(id, 10)
    if (isNaN(driveId)) return reply.status(400).send({ error: 'Bad Request', message: 'Invalid ID' })

    try {
      await svc().mountDrive(driveId)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message === 'Drive not found' ? 404 : 500
      return reply.status(status).send({
        error: status === 404 ? 'Not Found' : 'Internal Server Error',
        message,
      })
    }
  })

  // POST /api/network-drives/:id/unmount
  fastify.post('/:id/unmount', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const driveId = parseInt(id, 10)
    if (isNaN(driveId)) return reply.status(400).send({ error: 'Bad Request', message: 'Invalid ID' })

    try {
      await svc().unmountDrive(driveId)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message === 'Drive not found' ? 404 : 500
      return reply.status(status).send({
        error: status === 404 ? 'Not Found' : 'Internal Server Error',
        message,
      })
    }
  })
}
