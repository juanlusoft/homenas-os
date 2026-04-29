import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { backupApi } from '../api/backup'
import type { CreateBackupJobInput } from '@homenas/shared'

export function useBackupJobs() {
  return useQuery({
    queryKey: ['backup', 'jobs'],
    queryFn: () => backupApi.listJobs(),
    staleTime: 15_000,
  })
}

export function useBackupProgress() {
  return useQuery({
    queryKey: ['backup', 'progress'],
    queryFn: () => backupApi.getProgress(),
    refetchInterval: (query) => query.state.data?.running ? 2_000 : false,
  })
}

export function useBackupHistory(jobId: number | null) {
  return useQuery({
    queryKey: ['backup', 'history', jobId],
    queryFn: () => backupApi.getHistory(jobId!),
    staleTime: 30_000,
    enabled: jobId !== null,
  })
}

export function useCreateBackupJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateBackupJobInput) => backupApi.createJob(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup', 'jobs'] })
    },
  })
}

export function useUpdateBackupJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<CreateBackupJobInput> }) =>
      backupApi.updateJob(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup', 'jobs'] })
    },
  })
}

export function useRunBackupJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobId: number) => backupApi.runJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup', 'progress'] })
      queryClient.invalidateQueries({ queryKey: ['backup', 'jobs'] })
    },
  })
}

export function useCancelBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => backupApi.cancelBackup(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup', 'progress'] })
      queryClient.invalidateQueries({ queryKey: ['backup', 'jobs'] })
    },
  })
}

export function useDeleteBackupJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => backupApi.deleteJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup', 'jobs'] })
    },
  })
}
