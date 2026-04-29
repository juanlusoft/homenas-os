import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { schedulerApi } from '../api/scheduler'
import type { CreateTaskInput, UpdateTaskInput } from '@homenas/shared'

export function useSchedulerTasks() {
  return useQuery({
    queryKey: ['scheduler', 'tasks'],
    queryFn: () => schedulerApi.listTasks(),
    staleTime: 15_000,
  })
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateTaskInput) => schedulerApi.createTask(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduler', 'tasks'] })
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateTaskInput }) =>
      schedulerApi.updateTask(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduler', 'tasks'] })
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => schedulerApi.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduler', 'tasks'] })
    },
  })
}

export function useToggleTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => schedulerApi.toggleTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduler', 'tasks'] })
    },
  })
}

export function useRunTaskNow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => schedulerApi.runNow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduler', 'tasks'] })
    },
  })
}
