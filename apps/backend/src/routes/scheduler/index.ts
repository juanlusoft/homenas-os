import type { FastifyInstance } from 'fastify'
import { CreateTaskSchema, UpdateTaskSchema } from '@homenas/shared'
import { createSchedulerService } from '../../services/scheduler.service.js'

export async function schedulerRoutes(fastify: FastifyInstance) {
  const { requireAuth, requireAdmin } = fastify

  // GET /api/scheduler/tasks — list all tasks [any authenticated user]
  fastify.get('/tasks', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    const service = createSchedulerService(fastify.db)
    return reply.send(service.listTasks())
  })

  // POST /api/scheduler/tasks — create task [admin only]
  fastify.post('/tasks', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const result = CreateTaskSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Bad Request', message: result.error.message })
    }

    const service = createSchedulerService(fastify.db)
    try {
      const task = service.createTask(result.data)
      return reply.status(201).send(task)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(400).send({ error: 'Bad Request', message })
    }
  })

  // PUT /api/scheduler/tasks/:id — update task [admin only]
  fastify.put('/tasks/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const taskId = parseInt(id, 10)

    if (isNaN(taskId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid task ID' })
    }

    const result = UpdateTaskSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Bad Request', message: result.error.message })
    }

    const service = createSchedulerService(fastify.db)
    try {
      const task = service.updateTask(taskId, result.data)
      return reply.send(task)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message === 'Task not found' ? 404 : 400
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Bad Request', message })
    }
  })

  // DELETE /api/scheduler/tasks/:id — delete task [admin only]
  fastify.delete('/tasks/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const taskId = parseInt(id, 10)

    if (isNaN(taskId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid task ID' })
    }

    const service = createSchedulerService(fastify.db)
    try {
      service.deleteTask(taskId)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message === 'Task not found' ? 404 : 400
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Bad Request', message })
    }
  })

  // POST /api/scheduler/tasks/:id/toggle — toggle enabled [admin only]
  fastify.post('/tasks/:id/toggle', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const taskId = parseInt(id, 10)

    if (isNaN(taskId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid task ID' })
    }

    const service = createSchedulerService(fastify.db)
    try {
      const task = service.toggleTask(taskId)
      return reply.send(task)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message === 'Task not found' ? 404 : 400
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Bad Request', message })
    }
  })

  // POST /api/scheduler/tasks/:id/run — run task immediately [admin only]
  fastify.post('/tasks/:id/run', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const taskId = parseInt(id, 10)

    if (isNaN(taskId)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid task ID' })
    }

    const service = createSchedulerService(fastify.db)
    try {
      const task = await service.runNow(taskId)
      return reply.send(task)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message === 'Task not found' ? 404 : 400
      return reply.status(status).send({ error: status === 404 ? 'Not Found' : 'Bad Request', message })
    }
  })
}
