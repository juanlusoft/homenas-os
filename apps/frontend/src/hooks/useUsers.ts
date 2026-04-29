import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '../api/users'
import type { CreateUserInput, UpdatePasswordInput, AdminUpdatePasswordInput } from '@homenas/shared'

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.listUsers(),
    staleTime: 30_000,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateUserInput) => usersApi.createUser(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => usersApi.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useUpdateMyPassword() {
  return useMutation({
    mutationFn: (body: UpdatePasswordInput) => usersApi.updateMyPassword(body),
  })
}

export function useAdminUpdatePassword() {
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AdminUpdatePasswordInput }) =>
      usersApi.adminUpdatePassword(id, body),
  })
}
