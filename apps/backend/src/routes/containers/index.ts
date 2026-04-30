import type { FastifyInstance } from 'fastify'
import { EditPayloadSchema } from '@homenas/shared'
import { editApp, getEffectiveConfig } from '../../services/homestore.service.js'

// Tight rate limit: edits stop & recreate the container, so we treat them like
// updates / installs.
const heavyRateLimit = {
  config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
}

// PATCH /api/containers/:id
//
// Edits a HomeStore-installed container. Only the fields present in the body
// are merged onto the persisted config; everything else is preserved. The
// service layer runs full validation, recreates the container, and rolls back
// automatically if the new run fails.
//
// Response shape: see `EditResponseSchema` in @homenas/shared.
//
// TODO(orchestrator): consider mounting this under /api/homestore/edit/:id for
// route-prefix consistency with the rest of the lifecycle endpoints. The spec
// asked for /api/containers, so that's what we expose — but a thin alias
// inside homestore would let the frontend pick whichever feels cleaner.
export async function containersRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  // GET /api/containers/:id/config
  //
  // Returns the persisted runtime config of an installed HomeStore container
  // so the edit modal can prefill its fields with the *real* values rather
  // than the catalog defaults. Read-only, admin-gated to match PATCH.
  fastify.get<{ Params: { id: string } }>('/:id/config', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params

    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid container id' })
    }

    try {
      const config = await getEffectiveConfig(id)
      if (config === null) {
        return reply.status(404).send({ error: 'Not Found', message: `App '${id}' is not installed` })
      }
      return reply.send(config)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      if (message.includes('not found in catalog') || message.includes('Invalid app ID')) {
        return reply.status(404).send({ error: 'Not Found', message })
      }
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })

  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [requireAuth, requireAdmin],
    ...heavyRateLimit,
  }, async (request, reply) => {
    const { id } = request.params

    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid container id' })
    }

    const parsed = EditPayloadSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Bad Request', message: parsed.error.message })
    }

    try {
      const result = await editApp(id, parsed.data)
      return reply.send(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'

      // Map known service-layer errors to appropriate HTTP statuses.
      if (message.includes('not installed') || message.includes('not found in catalog')) {
        return reply.status(404).send({ error: 'Not Found', message })
      }
      if (
        message.includes('Path traversal') ||
        message.includes('Null bytes') ||
        message.includes('does not exist') ||
        message.includes('Cannot resolve image') ||
        message.includes('Invalid app ID')
      ) {
        return reply.status(400).send({ error: 'Bad Request', message })
      }
      if (message.includes('already published')) {
        return reply.status(409).send({ error: 'Conflict', message })
      }
      return reply.status(500).send({ error: 'Internal Server Error', message })
    }
  })
}
