import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cloudBackupApi } from '../api/cloud-backup'
import type { CreateRemoteInput, CreateJobInput } from '../api/cloud-backup'

export function useCloudBackupStatus() {
  return useQuery({
    queryKey: ['cloud-backup', 'status'],
    queryFn: () => cloudBackupApi.getStatus(),
    staleTime: 30_000,
  })
}

export function useInstallRclone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => cloudBackupApi.install(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-backup', 'status'] })
    },
  })
}

export function useCloudRemotes() {
  return useQuery({
    queryKey: ['cloud-backup', 'remotes'],
    queryFn: () => cloudBackupApi.listRemotes(),
    staleTime: 30_000,
  })
}

export function useRemoteInfo(name: string | null) {
  return useQuery({
    queryKey: ['cloud-backup', 'remote-info', name],
    queryFn: () => cloudBackupApi.getRemoteInfo(name!),
    enabled: name !== null,
    staleTime: 60_000,
    retry: false,
  })
}

export function useConfigureRemote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRemoteInput) => cloudBackupApi.configureRemote(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-backup', 'remotes'] })
    },
  })
}

export function useDeleteRemote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => cloudBackupApi.deleteRemote(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-backup', 'remotes'] })
      queryClient.invalidateQueries({ queryKey: ['cloud-backup', 'jobs'] })
    },
  })
}

export function useCloudJobs() {
  return useQuery({
    queryKey: ['cloud-backup', 'jobs'],
    queryFn: () => cloudBackupApi.listJobs(),
    staleTime: 15_000,
  })
}

export function useCreateCloudJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateJobInput) => cloudBackupApi.createJob(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-backup', 'jobs'] })
    },
  })
}

export function useUpdateCloudJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<CreateJobInput> }) =>
      cloudBackupApi.updateJob(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-backup', 'jobs'] })
    },
  })
}

export function useDeleteCloudJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => cloudBackupApi.deleteJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-backup', 'jobs'] })
    },
  })
}

export function useRunCloudJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => cloudBackupApi.runJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-backup', 'progress'] })
      queryClient.invalidateQueries({ queryKey: ['cloud-backup', 'jobs'] })
    },
  })
}

export function useTransferProgress() {
  return useQuery({
    queryKey: ['cloud-backup', 'progress'],
    queryFn: () => cloudBackupApi.getProgress(),
    refetchInterval: (query) => (query.state.data?.running ? 2_000 : 10_000),
  })
}

export function useCancelTransfer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => cloudBackupApi.cancelTransfer(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-backup', 'progress'] })
      queryClient.invalidateQueries({ queryKey: ['cloud-backup', 'jobs'] })
      queryClient.invalidateQueries({ queryKey: ['cloud-backup', 'transfers'] })
    },
  })
}

export function useTransferHistory() {
  return useQuery({
    queryKey: ['cloud-backup', 'transfers'],
    queryFn: () => cloudBackupApi.listTransfers(),
    staleTime: 15_000,
  })
}
