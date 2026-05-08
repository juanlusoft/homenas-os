import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { activeBackupApi } from '../api/active-backup'

// ── Device list ────────────────────────────────────────────────────────────────

export function useAbDevices() {
  return useQuery({
    queryKey: ['active-backup', 'devices'],
    queryFn: () => activeBackupApi.listDevices(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

// ── Device detail ──────────────────────────────────────────────────────────────

export function useAbDevice(id: number | null) {
  return useQuery({
    queryKey: ['active-backup', 'device', id],
    queryFn: () => activeBackupApi.getDevice(id!),
    enabled: id !== null,
    staleTime: 10_000,
  })
}

// ── Progress (per device) ──────────────────────────────────────────────────────

export function useAbProgress(deviceId: number | null) {
  return useQuery({
    queryKey: ['active-backup', 'progress', deviceId],
    queryFn: () => activeBackupApi.getProgress(deviceId!),
    enabled: deviceId !== null,
    refetchInterval: (query) => query.state.data?.running ? 2_000 : false,
  })
}

// ── Versions ───────────────────────────────────────────────────────────────────

export function useAbVersions(deviceId: number | null) {
  return useQuery({
    queryKey: ['active-backup', 'versions', deviceId],
    queryFn: () => activeBackupApi.listVersions(deviceId!),
    enabled: deviceId !== null,
    staleTime: 30_000,
  })
}

// ── File browser ───────────────────────────────────────────────────────────────

export function useAbBrowse(deviceId: number | null, version: string | null, path: string) {
  return useQuery({
    queryKey: ['active-backup', 'browse', deviceId, version, path],
    queryFn: () => activeBackupApi.browseFiles(deviceId!, version!, path),
    enabled: deviceId !== null && version !== null,
    staleTime: 60_000,
  })
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export function useApproveDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => activeBackupApi.approveDevice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-backup', 'devices'] })
    },
  })
}

export function useDeleteDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => activeBackupApi.deleteDevice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-backup', 'devices'] })
    },
  })
}

export function useTriggerBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => activeBackupApi.triggerBackup(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['active-backup', 'progress', id] })
      qc.invalidateQueries({ queryKey: ['active-backup', 'devices'] })
    },
  })
}

export function useCancelBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => activeBackupApi.cancelBackup(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['active-backup', 'progress', id] })
      qc.invalidateQueries({ queryKey: ['active-backup', 'devices'] })
    },
  })
}

export function useCreateDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; hostname?: string | null; os_type: 'windows' | 'mac' | 'linux' }) =>
      activeBackupApi.createDevice(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['active-backup', 'devices'] }),
  })
}
