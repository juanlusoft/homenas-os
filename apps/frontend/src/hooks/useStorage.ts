import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { storageApi } from '../api/storage'
import type { StartSnapRaidInput, StartBadblocksInput, CacheDrainConfig } from '@homenas/shared'

export function useDisks() {
  return useQuery({
    queryKey: ['storage', 'disks'],
    queryFn: () => storageApi.listDisks(),
    staleTime: 30_000,
  })
}

export function useIoStats(diskIds: string[]) {
  return useQuery({
    queryKey: ['storage', 'iostats', diskIds],
    queryFn: () => storageApi.getIoStats(diskIds),
    enabled: diskIds.length > 0,
    refetchInterval: 3_000,
    staleTime: 0,
  })
}

export function useSnapRaidStatus() {
  return useQuery({
    queryKey: ['storage', 'snapraid', 'status'],
    queryFn: () => storageApi.getSnapRaidStatus(),
    refetchInterval: (query) => {
      return query.state.data?.running ? 2_000 : 10_000
    },
  })
}

export function useMergerFSStatus() {
  return useQuery({
    queryKey: ['storage', 'mergerfs', 'status'],
    queryFn: () => storageApi.getMergerFSStatus(),
    staleTime: 15_000,
  })
}

export function useDrainMergerFSCache() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => storageApi.drainMergerFSCache(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage', 'mergerfs', 'status'] })
      queryClient.invalidateQueries({ queryKey: ['storage', 'mergerfs', 'drain-config'] })
    },
  })
}

export function useCacheDrainStatus() {
  return useQuery({
    queryKey: ['storage', 'mergerfs', 'drain-config'],
    queryFn: () => storageApi.getCacheDrainStatus(),
    staleTime: 30_000,
  })
}

export function useSetCacheDrainConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: CacheDrainConfig) => storageApi.setCacheDrainConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage', 'mergerfs', 'drain-config'] })
    },
  })
}

export function useBadblocksStatus() {
  return useQuery({
    queryKey: ['storage', 'badblocks', 'status'],
    queryFn: () => storageApi.getBadblocksStatus(),
    refetchInterval: (query) => {
      return query.state.data?.running ? 2_000 : 10_000
    },
  })
}

export function useStartSnapRaid() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: StartSnapRaidInput) => storageApi.startSnapRaid(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage', 'snapraid', 'status'] })
    },
  })
}

export function useStopSnapRaid() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => storageApi.stopSnapRaid(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage', 'snapraid', 'status'] })
    },
  })
}

export function useStartBadblocks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: StartBadblocksInput) => storageApi.startBadblocks(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage', 'badblocks', 'status'] })
    },
  })
}

export function useStopBadblocks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => storageApi.stopBadblocks(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage', 'badblocks', 'status'] })
    },
  })
}
