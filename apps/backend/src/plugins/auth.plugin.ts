import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { createSessionsRepo } from '../repositories/sessions.repo.js'
import { createUsersRepo } from '../repositories/users.repo.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days absolute
const IDLE_TTL_SECONDS = 8 * 60 * 60          // 8 hours inactivity

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: number; username: string; role: 'admin' | 'user'; csrfToken: string }
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

async function authPlugin(fastify: FastifyInstance) {
  const requireAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const sessionId = request.headers['x-session-id'] as string | undefined

    if (!sessionId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing X-Session-Id header' })
    }

    const sessionsRepo = createSessionsRepo(fastify.db)
    const session = sessionsRepo.findById(sessionId)

    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid session' })
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    if (session.expiresAt < nowSeconds) {
      sessionsRepo.delete(sessionId)
      return reply.status(401).send({ error: 'Unauthorized', message: 'Session expired' })
    }

    // Idle timeout: reject if inactive for more than 8 hours (idleExpiresAt=0 means legacy session — skip check once, initialize it below)
    if (session.idleExpiresAt > 0 && session.idleExpiresAt < nowSeconds) {
      sessionsRepo.delete(sessionId)
      return reply.status(401).send({ error: 'Unauthorized', message: 'Session expired due to inactivity' })
    }

    const usersRepo = createUsersRepo(fastify.db)
    const user = usersRepo.findById(session.userId)

    if (!user) {
      sessionsRepo.delete(sessionId)
      return reply.status(401).send({ error: 'Unauthorized', message: 'User not found' })
    }

    // CSRF validation for all mutating requests
    if (!SAFE_METHODS.has(request.method)) {
      const csrfHeader = request.headers['x-csrf-token'] as string | undefined
      if (!csrfHeader || csrfHeader !== session.csrfToken) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Invalid CSRF token' })
      }
    }

    // Idle expiry resets on activity (8h sliding window).
    // Absolute expiry (7d) stays fixed at creation — never extended, otherwise
    // an active session lives forever and the "absolute" TTL is meaningless.
    sessionsRepo.updateIdleExpiry(sessionId, nowSeconds + IDLE_TTL_SECONDS)

    request.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      csrfToken: session.csrfToken,
    }
  }

  fastify.decorate('requireAuth', requireAuth)
}

export default fp(authPlugin, { name: 'auth-plugin', dependencies: ['db-plugin'] })
