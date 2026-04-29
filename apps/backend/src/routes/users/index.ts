import type { FastifyInstance } from 'fastify'
import {
  CreateUserSchema,
  UpdatePasswordSchema,
  AdminUpdatePasswordSchema,
} from '@homenas/shared'
import { createUsersService } from '../../services/users.service.js'

export async function usersRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  // GET /api/users — list all users [admin only]
  fastify.get('/', {
    preHandler: [requireAuth, requireAdmin],
  }, async (_request, reply) => {
    const service = createUsersService(fastify.db)
    return reply.send(service.listUsers())
  })

  // POST /api/users — create user [admin only]
  fastify.post('/', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const result = CreateUserSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Bad Request', message: result.error.message })
    }

    const service = createUsersService(fastify.db)
    try {
      const user = await service.createUser(result.data)
      fastify.db.prepare(`INSERT INTO audit_log (user_id, username, action, detail, ip) VALUES (?, ?, 'create_user', ?, ?)`)
        .run(request.user.id, request.user.username, `created user: ${user.username}`, request.ip)
      return reply.status(201).send(user)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(400).send({ error: 'Bad Request', message })
    }
  })

  // DELETE /api/users/:id — delete user [admin only]
  fastify.delete('/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = parseInt(id, 10)

    if (isNaN(userId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid user ID' })
    }

    // Prevent admin from deleting themselves
    if (request.user.id === userId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Cannot delete your own account' })
    }

    const service = createUsersService(fastify.db)
    try {
      service.deleteUser(userId)
      fastify.db.prepare(`INSERT INTO audit_log (user_id, username, action, detail, ip) VALUES (?, ?, 'delete_user', ?, ?)`)
        .run(request.user.id, request.user.username, `deleted user id: ${userId}`, request.ip)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(400).send({ error: 'Bad Request', message })
    }
  })

  // POST /api/users/me/password — update own password [any authenticated user]
  fastify.post('/me/password', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const result = UpdatePasswordSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Bad Request', message: result.error.message })
    }

    const service = createUsersService(fastify.db)
    try {
      await service.updatePassword(request.user.id, result.data)
      fastify.db.prepare(`INSERT INTO audit_log (user_id, username, action, ip) VALUES (?, ?, 'change_password_self', ?)`)
        .run(request.user.id, request.user.username, request.ip)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(400).send({ error: 'Bad Request', message })
    }
  })

  // POST /api/users/:id/password — admin change any user's password [admin only]
  fastify.post('/:id/password', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = parseInt(id, 10)

    if (isNaN(userId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid user ID' })
    }

    const result = AdminUpdatePasswordSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Bad Request', message: result.error.message })
    }

    const service = createUsersService(fastify.db)
    try {
      await service.adminUpdatePassword(userId, result.data.newPassword)
      fastify.db.prepare(`INSERT INTO audit_log (user_id, username, action, detail, ip) VALUES (?, ?, 'admin_change_password', ?, ?)`)
        .run(request.user.id, request.user.username, `target user id: ${userId}`, request.ip)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(400).send({ error: 'Bad Request', message })
    }
  })
}
