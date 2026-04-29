import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adApi } from '../api/active-directory'
import type { ProvisionConfig, CreateUserPayload } from '../api/active-directory'

// ─── Status ───────────────────────────────────────────────────────────────────

export function useADStatus() {
  return useQuery({
    queryKey: ['ad', 'status'],
    queryFn: () => adApi.getStatus(),
    refetchInterval: (query) => {
      const data = query.state.data
      // Poll faster when not yet installed or service not active
      if (!data?.sambaInstalled || !data?.serviceActive) return 10_000
      return 30_000
    },
    staleTime: 5_000,
  })
}

// ─── Install ──────────────────────────────────────────────────────────────────

export function useADInstallProgress() {
  return useQuery({
    queryKey: ['ad', 'install', 'progress'],
    queryFn: () => adApi.getInstallProgress(),
    refetchInterval: (query) => (query.state.data?.running ? 2_000 : false),
    staleTime: 1_000,
  })
}

export function useStartADInstall() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => adApi.startInstall(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad', 'install', 'progress'] })
      queryClient.invalidateQueries({ queryKey: ['ad', 'status'] })
    },
  })
}

// ─── Provision ────────────────────────────────────────────────────────────────

export function useProvisionDomain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: ProvisionConfig) => adApi.provision(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad', 'status'] })
    },
  })
}

// ─── Service control ──────────────────────────────────────────────────────────

export function useADServiceControl() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ad', 'status'] })
  }

  const start = useMutation({
    mutationFn: () => adApi.startService(),
    onSuccess: invalidate,
  })
  const stop = useMutation({
    mutationFn: () => adApi.stopService(),
    onSuccess: invalidate,
  })
  const restart = useMutation({
    mutationFn: () => adApi.restartService(),
    onSuccess: invalidate,
  })

  return { start, stop, restart }
}

// ─── Users ────────────────────────────────────────────────────────────────────

export function useADUsers() {
  return useQuery({
    queryKey: ['ad', 'users'],
    queryFn: () => adApi.listUsers(),
    staleTime: 15_000,
  })
}

export function useCreateADUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => adApi.createUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad', 'users'] })
    },
  })
}

export function useDeleteADUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (username: string) => adApi.deleteUser(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad', 'users'] })
    },
  })
}

export function useEnableADUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (username: string) => adApi.enableUser(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad', 'users'] })
    },
  })
}

export function useDisableADUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (username: string) => adApi.disableUser(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad', 'users'] })
    },
  })
}

export function useResetADPassword() {
  return useMutation({
    mutationFn: ({ username, newPassword }: { username: string; newPassword: string }) =>
      adApi.resetPassword(username, newPassword),
  })
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export function useADGroups() {
  return useQuery({
    queryKey: ['ad', 'groups'],
    queryFn: () => adApi.listGroups(),
    staleTime: 15_000,
  })
}

export function useCreateADGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => adApi.createGroup(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad', 'groups'] })
    },
  })
}

export function useDeleteADGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => adApi.deleteGroup(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad', 'groups'] })
    },
  })
}

export function useAddADMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ group, username }: { group: string; username: string }) =>
      adApi.addMember(group, username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad', 'groups'] })
    },
  })
}

export function useRemoveADMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ group, username }: { group: string; username: string }) =>
      adApi.removeMember(group, username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad', 'groups'] })
    },
  })
}

// ─── Computers ────────────────────────────────────────────────────────────────

export function useADComputers() {
  return useQuery({
    queryKey: ['ad', 'computers'],
    queryFn: () => adApi.listComputers(),
    staleTime: 30_000,
  })
}
