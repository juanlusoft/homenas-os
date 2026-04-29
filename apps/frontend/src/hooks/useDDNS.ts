import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ddnsApi } from '../api/ddns'
import type { DdnsConfigInput } from '../api/ddns'

export function useDdnsConfigs() {
  return useQuery({
    queryKey: ['ddns', 'configs'],
    queryFn: () => ddnsApi.getStatus(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

export function useAddDdnsConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DdnsConfigInput) => ddnsApi.addConfig(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ddns', 'configs'] }),
  })
}

export function useRemoveDdnsConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => ddnsApi.removeConfig(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ddns', 'configs'] }),
  })
}

export function useUpdateDdnsNow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => ddnsApi.updateNow(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ddns', 'configs'] }),
  })
}
