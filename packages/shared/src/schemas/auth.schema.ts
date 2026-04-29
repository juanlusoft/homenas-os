import { z } from 'zod'

export const LoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
  totpCode: z.string().length(6).regex(/^\d{6}$/).optional(),
})

export const SessionSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.number(),
  username: z.string(),
  role: z.enum(['admin', 'user']),
  expiresAt: z.number(),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type Session = z.infer<typeof SessionSchema>
