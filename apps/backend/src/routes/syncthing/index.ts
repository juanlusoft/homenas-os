import type { FastifyInstance } from 'fastify'
import {
  getSyncthingStatus,
  installSyncthing,
  startSyncthing,
  stopSyncthing,
  listDevices,
  addDevice,
  removeDevice,
  listFolders,
  addFolder,
  removeFolder,
  getSyncStatus,
} from '../../services/syncthing.service.js'

export async function syncthingRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  // GET /api/syncthing/status
  fastify.get('/status', { preHandler: [requireAuth] }, async (_req, reply) => {
    try {
      const status = await getSyncthingStatus()
      return reply.send(status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/syncthing/install
  fastify.post('/install', { preHandler: [requireAuth, requireAdmin] }, async (_req, reply) => {
    try {
      await installSyncthing()
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/syncthing/start
  fastify.post('/start', { preHandler: [requireAuth, requireAdmin] }, async (_req, reply) => {
    try {
      await startSyncthing()
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/syncthing/stop
  fastify.post('/stop', { preHandler: [requireAuth, requireAdmin] }, async (_req, reply) => {
    try {
      await stopSyncthing()
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // ─── Devices ──────────────────────────────────────────────────────────────

  // GET /api/syncthing/devices
  fastify.get('/devices', { preHandler: [requireAuth] }, async (_req, reply) => {
    try {
      const devices = await listDevices()
      return reply.send(devices)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/syncthing/devices
  fastify.post('/devices', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
    const name = typeof body?.name === 'string' ? body.name.trim() : ''

    if (!deviceId || !name) {
      return reply.status(400).send({ error: 'Bad Request', message: 'deviceId and name are required' })
    }

    // Syncthing device IDs are 63-char uppercase Base32 strings separated by dashes
    if (!/^[A-Z2-7]{7}-[A-Z2-7]{7}-[A-Z2-7]{7}-[A-Z2-7]{7}-[A-Z2-7]{7}-[A-Z2-7]{7}-[A-Z2-7]{7}-[A-Z2-7]{7}$/.test(deviceId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid Syncthing device ID format' })
    }

    try {
      await addDevice(deviceId, name)
      return reply.status(201).send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // DELETE /api/syncthing/devices/:id
  fastify.delete('/devices/:id', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!id) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Device ID is required' })
    }
    try {
      await removeDevice(id)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // ─── Folders ──────────────────────────────────────────────────────────────

  // GET /api/syncthing/folders
  fastify.get('/folders', { preHandler: [requireAuth] }, async (_req, reply) => {
    try {
      const folders = await listFolders()
      return reply.send(folders)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/syncthing/folders
  fastify.post('/folders', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    const path = typeof body?.path === 'string' ? body.path.trim() : ''
    const sharedWithDevices = Array.isArray(body?.sharedWithDevices)
      ? (body.sharedWithDevices as unknown[]).filter((d): d is string => typeof d === 'string')
      : []

    if (!id || !path) {
      return reply.status(400).send({ error: 'Bad Request', message: 'id and path are required' })
    }

    try {
      await addFolder(id, path, sharedWithDevices)
      return reply.status(201).send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // DELETE /api/syncthing/folders/:id
  fastify.delete('/folders/:id', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!id) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Folder ID is required' })
    }
    try {
      await removeFolder(id)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // ─── Sync Status ──────────────────────────────────────────────────────────

  // GET /api/syncthing/sync-status
  fastify.get('/sync-status', { preHandler: [requireAuth] }, async (_req, reply) => {
    try {
      const status = await getSyncStatus()
      return reply.send(status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })
}
