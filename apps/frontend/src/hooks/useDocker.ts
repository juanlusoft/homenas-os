import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dockerApi } from '../api/docker'
import type { ContainerAction, ComposeAction } from '@homenas/shared'

export function useContainers() {
  return useQuery({
    queryKey: ['docker', 'containers'],
    queryFn: () => dockerApi.listContainers(),
    staleTime: 10_000,
    refetchInterval: 10_000,
  })
}

export function useContainerLogs(id: string, lines = 200) {
  return useQuery({
    queryKey: ['docker', 'containers', id, 'logs', lines],
    queryFn: () => dockerApi.getContainerLogs(id, lines),
    staleTime: 0,
    gcTime: 0,
    enabled: !!id,
  })
}

export function useComposeStacks() {
  return useQuery({
    queryKey: ['docker', 'stacks'],
    queryFn: () => dockerApi.listComposeStacks(),
    staleTime: 15_000,
  })
}

export function useComposeProgress() {
  return useQuery({
    queryKey: ['docker', 'stacks', 'progress'],
    queryFn: () => dockerApi.getComposeProgress(),
    refetchInterval: (query) => query.state.data?.running ? 2_000 : false,
  })
}

export function useContainerAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ContainerAction) => dockerApi.containerAction(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker', 'containers'] })
    },
  })
}

export function useComposeAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ComposeAction) => dockerApi.composeAction(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker', 'stacks'] })
    },
  })
}
