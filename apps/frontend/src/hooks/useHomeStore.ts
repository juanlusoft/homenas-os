import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { homestoreApi } from '../api/homestore'
import type { InstallPayload, UninstallPayload, EditPayload } from '@homenas/shared'

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

// ── useEditApp ────────────────────────────────────────────────────────────────
//
// Note: the PATCH endpoint always responds 200 with a discriminated union, even
// on rollback. The mutation therefore *resolves* (not rejects) for `ok:false`
// cases — the caller must inspect the response. Only true HTTP errors (4xx/5xx
// thrown by apiFetch) bubble up via `onError` / `mutateAsync` rejection.

export function useEditApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EditPayload }) =>
      homestoreApi.editApp(id, payload),
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

// ── useContainerConfig ────────────────────────────────────────────────────────
//
// Fetches the *currently persisted* config of an installed HomeStore container.
// The edit modal calls this on open so it can prefill ports/volumes/envVars
// with the user's real values instead of the catalog defaults. `staleTime: 0`
// ensures every modal open refetches — relevant if the user just edited and
// reopened.

export function useContainerConfig(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['homestore', 'containerConfig', id],
    queryFn: () => homestoreApi.getContainerConfig(id!),
    enabled: enabled && !!id,
    staleTime: 0,
    gcTime: 0,
  })
}
