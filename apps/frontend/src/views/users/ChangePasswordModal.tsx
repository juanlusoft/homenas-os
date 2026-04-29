import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import { useAdminUpdatePassword, useUpdateMyPassword } from '../../hooks/useUsers'
import { useT } from '../../i18n/useT'

// Admin form — only new password
const AdminPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

// Self form — current + new password
const SelfPasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

type AdminPasswordForm = z.infer<typeof AdminPasswordSchema>
type SelfPasswordForm = z.infer<typeof SelfPasswordSchema>

interface AdminProps {
  mode: 'admin'
  targetUserId: number
  targetUsername: string
  onClose: () => void
}

interface SelfProps {
  mode: 'self'
  onClose: () => void
}

type Props = AdminProps | SelfProps

function AdminChangePassword({ targetUserId, targetUsername, onClose }: AdminProps) {
  const t = useT()
  const mutation = useAdminUpdatePassword()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminPasswordForm>({ resolver: zodResolver(AdminPasswordSchema) })

  const onSubmit = async (data: AdminPasswordForm) => {
    try {
      await mutation.mutateAsync({ id: targetUserId, body: { newPassword: data.newPassword } })
      onClose()
    } catch {
      // error shown via mutation.error
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
      <p className="text-sm text-gray-500 dark:text-white/50">
        {t.users.changingFor(targetUsername)}
      </p>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">{t.users.newPassword}</label>
        <input
          {...register('newPassword')}
          type="password"
          autoComplete="new-password"
          placeholder={t.users.minPassword}
          className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        />
        {errors.newPassword && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.newPassword.message}</p>
        )}
      </div>

      {mutation.error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {mutation.error.message}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-white/60 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 transition-colors">
          {t.common.cancel}
        </button>
        <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-gray-900 dark:text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {mutation.isPending ? t.users.saving : t.users.changePassword}
        </button>
      </div>
    </form>
  )
}

function SelfChangePassword({ onClose }: SelfProps) {
  const t = useT()
  const mutation = useUpdateMyPassword()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SelfPasswordForm>({ resolver: zodResolver(SelfPasswordSchema) })

  const onSubmit = async (data: SelfPasswordForm) => {
    try {
      await mutation.mutateAsync({ currentPassword: data.currentPassword, newPassword: data.newPassword })
      onClose()
    } catch {
      // error shown via mutation.error
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">{t.users.currentPassword}</label>
        <input
          {...register('currentPassword')}
          type="password"
          autoComplete="current-password"
          className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        />
        {errors.currentPassword && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.currentPassword.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">{t.users.newPassword}</label>
        <input
          {...register('newPassword')}
          type="password"
          autoComplete="new-password"
          placeholder={t.users.minPassword}
          className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        />
        {errors.newPassword && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.newPassword.message}</p>
        )}
      </div>

      {mutation.error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {mutation.error.message}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-white/60 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 transition-colors">
          {t.common.cancel}
        </button>
        <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-gray-900 dark:text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {mutation.isPending ? t.users.saving : t.users.changeMyPassword}
        </button>
      </div>
    </form>
  )
}

export function ChangePasswordModal(props: Props) {
  const t = useT()
  const { onClose } = props
  const title = props.mode === 'admin' ? t.users.changePassword : t.users.changeMyPassword

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 hover:bg-black/5 dark:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {props.mode === 'admin' ? (
          <AdminChangePassword {...props} />
        ) : (
          <SelfChangePassword {...props} />
        )}
      </div>
    </div>
  )
}
