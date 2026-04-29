import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { systemInfoApi } from '../api/system-info'

export function useSystemInfo() {
  return useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => systemInfoApi.getInfo(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

export function useUpsStatus() {
  return useQuery({
    queryKey: ['system', 'ups'],
    queryFn: () => systemInfoApi.getUps(),
    refetchInterval: 10_000,
    staleTime: 5_000,
  })
}

export function useNotifications() {
  return useQuery({
    queryKey: ['system', 'notifications'],
    queryFn: () => systemInfoApi.getNotifications(),
    refetchInterval: 15_000,
    staleTime: 5_000,
  })
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => systemInfoApi.markAsRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system', 'notifications'] }),
  })
}
