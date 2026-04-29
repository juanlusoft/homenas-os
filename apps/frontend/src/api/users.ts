import { apiFetch } from './client'
import type { UserPublic, CreateUserInput, UpdatePasswordInput, AdminUpdatePasswordInput } from '@homenas/shared'

export const usersApi = {
  listUsers: (): Promise<UserPublic[]> =>
    apiFetch('/users'),

  createUser: (body: CreateUserInput): Promise<UserPublic> =>
    apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  deleteUser: (id: number): Promise<{ ok: boolean }> =>
    apiFetch(`/users/${id}`, { method: 'DELETE' }),

  updateMyPassword: (body: UpdatePasswordInput): Promise<{ ok: boolean }> =>
    apiFetch('/users/me/password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  adminUpdatePassword: (id: number, body: AdminUpdatePasswordInput): Promise<{ ok: boolean }> =>
    apiFetch(`/users/${id}/password`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}
