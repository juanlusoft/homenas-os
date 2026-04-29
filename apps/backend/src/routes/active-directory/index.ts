import type { FastifyInstance } from 'fastify'
import {
  getStatus,
  startInstall,
  getInstallProgress,
  provisionDomain,
  startService,
  stopService,
  restartService,
  listUsers,
  createUser,
  deleteUser,
  enableUser,
  disableUser,
  resetPassword,
  listGroups,
  createGroup,
  deleteGroup,
  addMember,
  removeMember,
  listComputers,
  validateUsername,
  validateDomainShort,
  validateRealm,
  validateGroup,
} from '../../services/active-directory.service.js'

export async function activeDirectoryRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  // ─── Status ───────────────────────────────────────────────────────────────

  // GET /api/ad/status
  fastify.get('/status', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    try {
      const status = await getStatus()
      return reply.send(status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // ─── Install ──────────────────────────────────────────────────────────────

  // POST /api/ad/install — rate limited 2/hour
  fastify.post('/install', {
    preHandler: [requireAuth, requireAdmin],
    config: { rateLimit: { max: 2, timeWindow: '1 hour' } },
  }, async (_request, reply) => {
    startInstall()
    return reply.send({ started: true })
  })

  // GET /api/ad/install/progress
  fastify.get('/install/progress', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    return reply.send(getInstallProgress())
  })

  // ─── Provision ────────────────────────────────────────────────────────────

  // POST /api/ad/provision — rate limited 2/hour
  fastify.post('/provision', {
    preHandler: [requireAuth, requireAdmin],
    config: { rateLimit: { max: 2, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const body = request.body as { domain?: unknown; realm?: unknown; adminPassword?: unknown }

    const domain = typeof body?.domain === 'string' ? body.domain.trim() : ''
    const realm = typeof body?.realm === 'string' ? body.realm.trim() : ''
    const adminPassword = typeof body?.adminPassword === 'string' ? body.adminPassword : ''

    if (!validateDomainShort(domain)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'domain must be 1-15 alphanumeric characters (NetBIOS name)',
      })
    }
    if (!validateRealm(realm)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'realm must be a valid FQDN (e.g. CORP.EXAMPLE.COM)',
      })
    }
    if (adminPassword.length < 8) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'adminPassword must be at least 8 characters',
      })
    }

    try {
      await provisionDomain({ domain, realm, adminPassword })
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // ─── Service control ──────────────────────────────────────────────────────

  // POST /api/ad/start
  fastify.post('/start', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    try {
      await startService()
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/ad/stop
  fastify.post('/stop', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    try {
      await stopService()
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/ad/restart
  fastify.post('/restart', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    try {
      await restartService()
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // ─── Users ────────────────────────────────────────────────────────────────

  // GET /api/ad/users
  fastify.get('/users', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    try {
      const users = await listUsers()
      return reply.send(users)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/ad/users
  fastify.post('/users', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const body = request.body as { username?: unknown; password?: unknown; displayName?: unknown }

    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''

    if (!validateUsername(username)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'username must be 1-20 alphanumeric/underscore/hyphen characters',
      })
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: 'Bad Request', message: 'password must be at least 8 characters' })
    }

    try {
      await createUser(username, password, displayName)
      return reply.status(201).send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // DELETE /api/ad/users/:username
  fastify.delete<{ Params: { username: string } }>('/users/:username', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { username } = request.params

    if (!validateUsername(username)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid username' })
    }

    try {
      await deleteUser(username)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('Cannot delete') ? 403 : 500
      return reply.status(status).send({ error: status === 403 ? 'Forbidden' : 'Internal Server Error', message })
    }
  })

  // POST /api/ad/users/:username/enable
  fastify.post<{ Params: { username: string } }>('/users/:username/enable', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { username } = request.params
    if (!validateUsername(username)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid username' })
    }
    try {
      await enableUser(username)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/ad/users/:username/disable
  fastify.post<{ Params: { username: string } }>('/users/:username/disable', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { username } = request.params
    if (!validateUsername(username)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid username' })
    }
    try {
      await disableUser(username)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('Cannot disable') ? 403 : 500
      return reply.status(status).send({ error: status === 403 ? 'Forbidden' : 'Internal Server Error', message })
    }
  })

  // POST /api/ad/users/:username/password
  fastify.post<{ Params: { username: string } }>('/users/:username/password', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { username } = request.params
    const body = request.body as { newPassword?: unknown }
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''

    if (!validateUsername(username)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid username' })
    }
    if (newPassword.length < 8) {
      return reply.status(400).send({ error: 'Bad Request', message: 'newPassword must be at least 8 characters' })
    }

    try {
      await resetPassword(username, newPassword)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // ─── Groups ───────────────────────────────────────────────────────────────

  // GET /api/ad/groups
  fastify.get('/groups', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    try {
      const groups = await listGroups()
      return reply.send(groups)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/ad/groups
  fastify.post('/groups', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const body = request.body as { name?: unknown }
    const name = typeof body?.name === 'string' ? body.name.trim() : ''

    if (!validateGroup(name)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Group name must be 1-64 chars: letters, digits, spaces, underscores, hyphens',
      })
    }

    try {
      await createGroup(name)
      return reply.status(201).send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // DELETE /api/ad/groups/:name
  fastify.delete<{ Params: { name: string } }>('/groups/:name', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { name } = request.params

    if (!validateGroup(decodeURIComponent(name))) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid group name' })
    }

    try {
      await deleteGroup(decodeURIComponent(name))
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // POST /api/ad/groups/:name/members
  fastify.post<{ Params: { name: string } }>('/groups/:name/members', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { name } = request.params
    const body = request.body as { username?: unknown }
    const username = typeof body?.username === 'string' ? body.username.trim() : ''

    if (!validateGroup(decodeURIComponent(name))) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid group name' })
    }
    if (!validateUsername(username)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid username' })
    }

    try {
      await addMember(decodeURIComponent(name), username)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // DELETE /api/ad/groups/:name/members/:username
  fastify.delete<{ Params: { name: string; username: string } }>('/groups/:name/members/:username', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { name, username } = request.params

    if (!validateGroup(decodeURIComponent(name))) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid group name' })
    }
    if (!validateUsername(username)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid username' })
    }

    try {
      await removeMember(decodeURIComponent(name), username)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  // ─── Computers ────────────────────────────────────────────────────────────

  // GET /api/ad/computers
  fastify.get('/computers', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    try {
      const computers = await listComputers()
      return reply.send(computers)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })
}
