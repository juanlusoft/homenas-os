import { z } from 'zod'

export const UserSchema = z.object({
  id: z.number(),
  username: z.string(),
  role: z.enum(['admin', 'user']),
  totpEnabled: z.boolean().optional(),
  createdAt: z.number(),
})

// Shared password strength rule — min 8 chars, at least one uppercase, one digit
const strongPassword = z.string()
  .min(8, 'Minimum 8 characters')
  .max(128)
  .refine((p) => /[A-Z]/.test(p), { message: 'At least one uppercase letter required' })
  .refine((p) => /[0-9]/.test(p), { message: 'At least one number required' })

export const CreateUserSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: strongPassword,
  role: z.enum(['admin', 'user']).default('user'),
})

export const UpdatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPassword,
})

export const AdminUpdatePasswordSchema = z.object({
  newPassword: strongPassword,
})

export type UserPublic = z.infer<typeof UserSchema>
export type CreateUserInput = z.infer<typeof CreateUserSchema>
export type UpdatePasswordInput = z.infer<typeof UpdatePasswordSchema>
export type AdminUpdatePasswordInput = z.infer<typeof AdminUpdatePasswordSchema>
