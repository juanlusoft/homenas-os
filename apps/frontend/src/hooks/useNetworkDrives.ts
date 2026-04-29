import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { networkDrivesApi } from '../api/network-drives'
import type { AddDriveInput } from '../api/network-drives'

export function useNetworkDrives() {
  return useQuery({
    queryKey: ['network-drives'],
    queryFn: () => networkDrivesApi.list(),
    refetchInterval: 15_000,
  })
}

export function useAddDrive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AddDriveInput) => networkDrivesApi.add(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['network-drives'] })
      qc.invalidateQueries({ queryKey: ['files', 'locations'] })
    },
  })
}

export function useDeleteDrive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => networkDrivesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['network-drives'] })
      qc.invalidateQueries({ queryKey: ['files', 'locations'] })
    },
  })
}

export function useMountDrive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => networkDrivesApi.mount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['network-drives'] })
      qc.invalidateQueries({ queryKey: ['files', 'locations'] })
    },
  })
}

export function useUnmountDrive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => networkDrivesApi.unmount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['network-drives'] })
      qc.invalidateQueries({ queryKey: ['files', 'locations'] })
    },
  })
}
