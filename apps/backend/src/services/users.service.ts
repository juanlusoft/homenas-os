import bcrypt from 'bcryptjs'
import type { Database } from 'better-sqlite3'
import { createUsersRepo } from '../repositories/users.repo.js'
import { createSessionsRepo } from '../repositories/sessions.repo.js'
import type { User } from '../repositories/users.repo.js'
import type { CreateUserInput, UpdatePasswordInput, UserPublic } from '@homenas/shared'

const BCRYPT_ROUNDS = 12

function toPublic(user: User): UserPublic {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  }
}

export function createUsersService(db: Database) {
  const usersRepo = createUsersRepo(db)
  const sessionsRepo = createSessionsRepo(db)

  return {
    listUsers(): UserPublic[] {
      const users = usersRepo.list()
      return users.map(toPublic)
    },

    async createUser(input: CreateUserInput): Promise<UserPublic> {
      const existing = usersRepo.findByUsername(input.username)
      if (existing) {
        throw new Error('Username already exists')
      }
      const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)
      const user = usersRepo.create({
        username: input.username,
        passwordHash,
        role: input.role,
      })
      return toPublic(user)
    },

    deleteUser(id: number): void {
      const user = usersRepo.findById(id)
      if (!user) {
        throw new Error('User not found')
      }

      // Cannot delete last admin
      if (user.role === 'admin') {
        const allUsers = usersRepo.list()
        const adminCount = allUsers.filter((u) => u.role === 'admin').length
        if (adminCount <= 1) {
          throw new Error('Cannot delete the last admin user')
        }
      }

      sessionsRepo.deleteByUserId(id)
      usersRepo.delete(id)
    },

    async updatePassword(id: number, input: UpdatePasswordInput): Promise<void> {
      const user = usersRepo.findById(id)
      if (!user) {
        throw new Error('User not found')
      }

      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash)
      if (!valid) {
        throw new Error('Current password is incorrect')
      }

      const newHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS)
      usersRepo.updatePassword(id, newHash)
      // Invalidate all sessions so the old password can no longer be used
      sessionsRepo.deleteByUserId(id)
    },

    async adminUpdatePassword(userId: number, newPassword: string): Promise<void> {
      const user = usersRepo.findById(userId)
      if (!user) {
        throw new Error('User not found')
      }

      const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
      usersRepo.updatePassword(userId, newHash)
      // Invalidate all sessions for the target user
      sessionsRepo.deleteByUserId(userId)
    },
  }
}
