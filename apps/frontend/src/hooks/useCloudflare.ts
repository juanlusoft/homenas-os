import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cloudflareApi } from '../api/cloudflare'

export function useCloudflareStatus() {
  return useQuery({
    queryKey: ['cloudflare', 'status'],
    queryFn: () => cloudflareApi.getStatus(),
    staleTime: 10_000,
    refetchInterval: (query) => query.state.data?.running ? 5_000 : 30_000,
  })
}

export function useConfigure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => cloudflareApi.configure(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloudflare', 'status'] })
    },
  })
}

export function useStartTunnel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => cloudflareApi.start(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloudflare', 'status'] })
    },
  })
}

export function useStopTunnel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => cloudflareApi.stop(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloudflare', 'status'] })
    },
  })
}

export function useRemoveTunnel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => {
      if (!window.confirm('¿Eliminar la configuración de Cloudflare Tunnel? Esta acción no se puede deshacer.')) {
        throw new Error('CANCELLED')
      }
      return cloudflareApi.remove()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloudflare', 'status'] })
    },
  })
}
