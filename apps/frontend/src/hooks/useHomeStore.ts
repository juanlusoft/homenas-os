import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { homestoreApi } from '../api/homestore'
import type { InstallPayload, UninstallPayload } from '@homenas/shared'

const CATALOG_KEY = ['homestore', 'catalog'] as const

// ── useHomeCatalog ────────────────────────────────────────────────────────────

export function useHomeCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => homestoreApi.getCatalog(),
    staleTime: 20_000,
    refetchInterval: 30_000,
  })
}

// ── useInstallApp ─────────────────────────────────────────────────────────────

export function useInstallApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: InstallPayload }) =>
      homestoreApi.installApp(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATALOG_KEY })
    },
  })
}

// ── useUninstallApp ───────────────────────────────────────────────────────────

export function useUninstallApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UninstallPayload }) =>
      homestoreApi.uninstallApp(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATALOG_KEY })
    },
  })
}

// ── useStartApp ───────────────────────────────────────────────────────────────

export function useStartApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => homestoreApi.startApp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATALOG_KEY })
    },
  })
}

// ── useStopApp ────────────────────────────────────────────────────────────────

export function useStopApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => homestoreApi.stopApp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATALOG_KEY })
    },
  })
}

// ── useRestartApp ─────────────────────────────────────────────────────────────

export function useRestartApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => homestoreApi.restartApp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATALOG_KEY })
    },
  })
}

// ── useUpdateApp ──────────────────────────────────────────────────────────────

export function useUpdateApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => homestoreApi.updateApp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATALOG_KEY })
    },
  })
}

// ── useAppLogs ────────────────────────────────────────────────────────────────

export function useAppLogs(id: string | null) {
  return useQuery({
    queryKey: ['homestore', 'logs', id],
    queryFn: () => homestoreApi.getAppLogs(id!),
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
  })
}
