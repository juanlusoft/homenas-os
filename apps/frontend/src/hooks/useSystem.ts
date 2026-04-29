import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { systemApi } from '../api/system'

export function useSystemMetrics() {
  return useQuery({
    queryKey: ['system', 'metrics'],
    queryFn: () => systemApi.getMetrics(),
    refetchInterval: 2000,
    staleTime: 1000,
  })
}

export function useSshStatus() {
  return useQuery({
    queryKey: ['system', 'ssh'],
    queryFn: () => systemApi.ssh.status(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

export function useEnableSsh() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => systemApi.ssh.enable(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['system', 'ssh'] }),
  })
}

export function useDisableSsh() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => systemApi.ssh.disable(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['system', 'ssh'] }),
  })
}
