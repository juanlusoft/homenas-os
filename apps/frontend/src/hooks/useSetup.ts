import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { setupApi } from '../api/setup'

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup', 'status'],
    queryFn: () => setupApi.getStatus(),
    staleTime: 30_000,
  })
}

export function useSetupAccount() {
  return useMutation({
    mutationFn: ({ username, newPassword, confirmPassword }: { username: string; newPassword: string; confirmPassword: string }) =>
      setupApi.changeAccount(username, newPassword, confirmPassword),
  })
}

export function useSetupPassword() {
  return useMutation({
    mutationFn: ({ newPassword, confirmPassword }: { newPassword: string; confirmPassword: string }) =>
      setupApi.changePassword(newPassword, confirmPassword),
  })
}

export function useSetupNetwork() {
  return useQuery({
    queryKey: ['setup', 'network'],
    queryFn: () => setupApi.getNetwork(),
    staleTime: 60_000,
  })
}

export function useConfigureNetwork() {
  return useMutation({
    mutationFn: (payload: {
      interface: string
      mode: 'dhcp' | 'static'
      ip?: string
      prefix?: number
      gateway?: string
      dns?: string
    }) => setupApi.configureNetwork(payload),
  })
}

export function useConfigurePool() {
  return useMutation({
    mutationFn: (payload: {
      disks: { device: string; role: 'data' | 'parity' | 'cache' }[]
      fsType: 'ext4' | 'xfs'
      poolType: 'single' | 'mergerfs' | 'snapraid'
    }) => setupApi.configurePool(payload),
  })
}

export function useCompleteSetup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => setupApi.complete(),
    onSuccess: () => {
      // Update cache immediately so SetupGuard doesn't see the stale complete:false
      queryClient.setQueryData(['setup', 'status'], { complete: true })
    },
  })
}
