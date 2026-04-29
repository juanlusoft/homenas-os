import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { syncthingApi } from '../api/syncthing'

export function useSyncthingStatus() {
  return useQuery({
    queryKey: ['syncthing', 'status'],
    queryFn: () => syncthingApi.getStatus(),
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
}

export function useSyncthingDevices() {
  return useQuery({
    queryKey: ['syncthing', 'devices'],
    queryFn: () => syncthingApi.listDevices(),
    staleTime: 15_000,
  })
}

export function useSyncthingFolders() {
  return useQuery({
    queryKey: ['syncthing', 'folders'],
    queryFn: () => syncthingApi.listFolders(),
    staleTime: 15_000,
  })
}

export function useSyncStatus() {
  return useQuery({
    queryKey: ['syncthing', 'sync-status'],
    queryFn: () => syncthingApi.getSyncStatus(),
    refetchInterval: 10_000,
  })
}

export function useInstallSyncthing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => syncthingApi.install(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syncthing', 'status'] })
    },
  })
}

export function useStartSyncthing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => syncthingApi.start(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syncthing', 'status'] })
    },
  })
}

export function useStopSyncthing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => syncthingApi.stop(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syncthing', 'status'] })
    },
  })
}

export function useAddDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ deviceId, name }: { deviceId: string; name: string }) =>
      syncthingApi.addDevice(deviceId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syncthing', 'devices'] })
    },
  })
}

export function useRemoveDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => syncthingApi.removeDevice(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syncthing', 'devices'] })
    },
  })
}

export function useAddFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      path,
      sharedWithDevices,
    }: {
      id: string
      path: string
      sharedWithDevices: string[]
    }) => syncthingApi.addFolder(id, path, sharedWithDevices),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syncthing', 'folders'] })
      queryClient.invalidateQueries({ queryKey: ['syncthing', 'sync-status'] })
    },
  })
}

export function useRemoveFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => syncthingApi.removeFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syncthing', 'folders'] })
      queryClient.invalidateQueries({ queryKey: ['syncthing', 'sync-status'] })
    },
  })
}
