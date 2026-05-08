import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { updatesApi } from '../api/updates'
import type { AutoUpdateConfig } from '../api/updates'

export function useUpdateStatus() {
  return useQuery({
    queryKey: ['updates', 'status'],
    queryFn: () => updatesApi.getStatus(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,  // refresh every 5 min
  })
}

export function useUpdateProcess(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  return useQuery({
    queryKey: ['updates', 'process'],
    queryFn: () => updatesApi.getProcess(),
    enabled,
    // Poll every 2s while active, otherwise every 30s.
    // When the query is disabled this interval is a no-op anyway.
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'updating' ? 2_000 : 30_000
    },
    staleTime: 1_000,
  })
}

export function useUpdateApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => updatesApi.updateApp(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })
}

export function useUpdateOs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (packages?: string[]) => updatesApi.updateOs(packages),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })
}

export function useAutoUpdateConfig() {
  return useQuery({
    queryKey: ['updates', 'auto'],
    queryFn: () => updatesApi.getAutoConfig(),
    staleTime: 30_000,
  })
}

export function useSetAutoUpdateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Pick<AutoUpdateConfig, 'enabled' | 'intervalMinutes'>) => updatesApi.setAutoConfig(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates', 'auto'] })
    },
  })
}
