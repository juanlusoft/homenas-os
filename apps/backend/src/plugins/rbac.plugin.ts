import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

async function rbacPlugin(fastify: FastifyInstance) {
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // requireAuth must run before this in the preHandler array
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' })
    }

    if (request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin role required' })
    }
  }

  fastify.decorate('requireAdmin', requireAdmin)
}

export default fp(rbacPlugin, { name: 'rbac-plugin', dependencies: ['auth-plugin'] })
