import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { networkApi } from '../api/network'
import type { AddWireguardPeerInput, WireguardInitInput, CreateSambaShareInput, UpdateSambaShareInput } from '@homenas/shared'
import type { IpConfigInput } from '../api/network'

export function useNetworkInterfaces() {
  return useQuery({
    queryKey: ['network', 'interfaces'],
    queryFn: () => networkApi.listInterfaces(),
    refetchInterval: 5_000,
  })
}

export function useWireguardStatus() {
  return useQuery({
    queryKey: ['network', 'wireguard', 'status'],
    queryFn: () => networkApi.getWireguardStatus(),
    staleTime: 10_000,
  })
}

export function useInstallWireguard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => networkApi.installWireguard(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network', 'wireguard', 'status'] })
    },
  })
}

export function useInitWireguard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: WireguardInitInput) => networkApi.initWireguard(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network', 'wireguard', 'status'] })
    },
  })
}

export function useStartWireguard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => networkApi.startWireguard(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network', 'wireguard', 'status'] })
    },
  })
}

export function useStopWireguard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => networkApi.stopWireguard(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network', 'wireguard', 'status'] })
    },
  })
}

export function useRestartWireguard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => networkApi.restartWireguard(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network', 'wireguard', 'status'] })
    },
  })
}

export function usePublicIp() {
  return useQuery({
    queryKey: ['network', 'public-ip'],
    queryFn: () => networkApi.getPublicIp(),
    staleTime: 5 * 60_000, // 5 min
    refetchInterval: 5 * 60_000,
  })
}

export function useDdnsStatus() {
  return useQuery({
    queryKey: ['network', 'ddns', 'status'],
    queryFn: () => networkApi.getDdnsStatus(),
    staleTime: 30_000,
  })
}

export function useSambaShares() {
  return useQuery({
    queryKey: ['network', 'samba', 'shares'],
    queryFn: () => networkApi.listSambaShares(),
    staleTime: 30_000,
  })
}

export function useSambaSessions() {
  return useQuery({
    queryKey: ['network', 'samba', 'sessions'],
    queryFn: () => networkApi.listSambaSessions(),
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
}

export function useCreateSambaShare() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSambaShareInput) => networkApi.createSambaShare(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network', 'samba', 'shares'] })
    },
  })
}

export function useUpdateSambaShare() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, fields }: { name: string; fields: UpdateSambaShareInput }) =>
      networkApi.updateSambaShare(name, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network', 'samba', 'shares'] })
    },
  })
}

export function useDeleteSambaShare() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => networkApi.deleteSambaShare(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network', 'samba', 'shares'] })
    },
  })
}

export function useNfsExports() {
  return useQuery({
    queryKey: ['network', 'nfs', 'exports'],
    queryFn: () => networkApi.listNfsExports(),
    staleTime: 30_000,
  })
}

export function useNfsStatus() {
  return useQuery({
    queryKey: ['network', 'nfs', 'status'],
    queryFn: () => networkApi.getNfsStatus(),
    refetchInterval: 15_000,
  })
}

export function useNetworkBandwidthStats() {
  return useQuery({
    queryKey: ['network', 'stats'],
    queryFn: () => networkApi.getNetworkBandwidthStats(),
    refetchInterval: 1_500,
  })
}

export function useAddWireguardPeer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: AddWireguardPeerInput) => networkApi.addWireguardPeer(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network', 'wireguard', 'status'] })
    },
  })
}

export function useRemoveWireguardPeer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (publicKey: string) => networkApi.removeWireguardPeer(publicKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network', 'wireguard', 'status'] })
    },
  })
}

export function useGetPeerConfig() {
  return useMutation({
    mutationFn: (publicKey: string) => networkApi.getPeerConfig(publicKey),
  })
}

export function useIpConfig() {
  return useQuery({
    queryKey: ['network', 'ip-config'],
    queryFn: () => networkApi.getIpConfig(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

export function useSetIpConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: IpConfigInput) => networkApi.setIpConfig(body),
    onSuccess: () => {
      // Refresh both ip-config and interfaces after a short delay (network change takes a moment)
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['network', 'ip-config'] })
        void queryClient.invalidateQueries({ queryKey: ['network', 'interfaces'] })
      }, 2000)
    },
  })
}
