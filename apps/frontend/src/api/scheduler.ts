import { apiFetch } from './client'
import type { ScheduledTask, CreateTaskInput, UpdateTaskInput } from '@homenas/shared'

export const schedulerApi = {
  listTasks: (): Promise<ScheduledTask[]> =>
    apiFetch('/scheduler/tasks'),

  createTask: (body: CreateTaskInput): Promise<ScheduledTask> =>
    apiFetch('/scheduler/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateTask: (id: number, body: UpdateTaskInput): Promise<ScheduledTask> =>
    apiFetch(`/scheduler/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteTask: (id: number): Promise<{ ok: boolean }> =>
    apiFetch(`/scheduler/tasks/${id}`, { method: 'DELETE' }),

  toggleTask: (id: number): Promise<ScheduledTask> =>
    apiFetch(`/scheduler/tasks/${id}/toggle`, { method: 'POST' }),

  runNow: (id: number): Promise<ScheduledTask> =>
    apiFetch(`/scheduler/tasks/${id}/run`, { method: 'POST' }),
}
