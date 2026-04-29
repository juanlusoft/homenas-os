import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Plus, Trash2 } from 'lucide-react'
import { CreateUserSchema, type CreateUserInput } from '@homenas/shared'
import { useCreateUser } from '../../hooks/useUsers'
import { useT } from '../../i18n/useT'

interface FolderPermission {
  path: string
  access: 'ro' | 'rw'
}

interface Props {
  onClose: () => void
}

const DEFAULT_PATHS = [
  '/mnt/disks/disk1',
  '/mnt/disks/disk2',
  '/mnt/disks/disk3',
  '/mnt/disks/disk4',
]

export function CreateUserModal({ onClose }: Props) {
  const t = useT()
  const createUser = useCreateUser()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: { role: 'user' },
  })

  const role = watch('role')

  // Permissions state — managed outside RHF since it's not in CreateUserSchema
  const [permissions, setPermissions] = useState<FolderPermission[]>([])
  const [newPath, setNewPath] = useState('')
  const [pathError, setPathError] = useState('')

  function addPermission() {
    const trimmed = newPath.trim()
    if (!trimmed) {
      setPathError(t.users.pathRequired)
      return
    }
    if (!/^\/[a-zA-Z0-9/_-]+$/.test(trimmed)) {
      setPathError(t.users.pathInvalid)
      return
    }
    if (permissions.some((p) => p.path === trimmed)) {
      setPathError(t.users.pathDuplicate)
      return
    }
    setPathError('')
    setPermissions((prev) => [...prev, { path: trimmed, access: 'ro' }])
    setNewPath('')
  }

  function removePermission(path: string) {
    setPermissions((prev) => prev.filter((p) => p.path !== path))
  }

  function toggleAccess(path: string) {
    setPermissions((prev) =>
      prev.map((p) =>
        p.path === path ? { ...p, access: p.access === 'ro' ? 'rw' : 'ro' } : p,
      ),
    )
  }

  const onSubmit = async (data: CreateUserInput) => {
    try {
      const payload =
        data.role === 'user' && permissions.length > 0
          ? { ...data, permissions }
          : data
      await createUser.mutateAsync(payload as CreateUserInput)
      onClose()
    } catch {
      // error shown via createUser.error
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t.users.createUser}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 hover:bg-black/5 dark:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form — scrollable */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="px-6 py-5 space-y-4 overflow-y-auto"
        >
          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">
              {t.users.username}
            </label>
            <input
              {...register('username')}
              type="text"
              autoComplete="off"
              placeholder="e.g. john_doe"
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            {errors.username && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.username.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">
              {t.auth.password}
            </label>
            <input
              {...register('password')}
              type="password"
              autoComplete="new-password"
              placeholder={t.users.minPassword}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password.message}</p>
            )}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">
              {t.users.role}
            </label>
            <select
              {...register('role')}
              className="w-full bg-gray-100 dark:bg-gray-800 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            >
              <option value="user">{t.users.user}</option>
              <option value="admin">{t.users.admin}</option>
            </select>
            {errors.role && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.role.message}</p>
            )}
          </div>

          {/* Folder permissions — only for role === 'user' */}
          {role === 'user' && (
            <div className="border border-black/10 dark:border-white/10 rounded-lg p-4 space-y-3 bg-black/5 dark:bg-white/5">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-white/70">{t.users.folderPermissions}</p>
                <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
                  {t.users.folderPermissionsDesc}
                </p>
              </div>

              {/* Quick-add from known paths */}
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_PATHS.filter(
                  (p) => !permissions.some((perm) => perm.path === p),
                ).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPermissions((prev) => [...prev, { path: p, access: 'ro' }])
                    }}
                    className="text-xs px-2 py-0.5 rounded bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-500 dark:text-white/50 hover:text-indigo-700 dark:text-indigo-300 hover:border-indigo-500/40 transition-colors font-mono"
                  >
                    + {p}
                  </button>
                ))}
              </div>

              {/* Manual path input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPath}
                  onChange={(e) => { setNewPath(e.target.value); setPathError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPermission() } }}
                  placeholder="/mnt/disks/disco5"
                  className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-900 dark:text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={addPermission}
                  className="flex items-center gap-1 text-xs font-medium bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t.users.addPath}
                </button>
              </div>
              {pathError && (
                <p className="text-xs text-red-600 dark:text-red-400">{pathError}</p>
              )}

              {/* Permissions list */}
              {permissions.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-white/30 italic text-center py-2">
                  {t.users.noPaths}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {permissions.map((perm) => (
                    <div
                      key={perm.path}
                      className="flex items-center gap-2 bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2"
                    >
                      <span className="flex-1 font-mono text-xs text-gray-700 dark:text-white/70 truncate">
                        {perm.path}
                      </span>

                      {/* ro / rw toggle */}
                      <button
                        type="button"
                        onClick={() => toggleAccess(perm.path)}
                        className={`text-xs font-medium px-2 py-0.5 rounded transition-colors ${
                          perm.access === 'rw'
                            ? 'bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30'
                            : 'bg-black/10 dark:bg-white/10 text-gray-500 dark:text-white/40 hover:bg-black/15 dark:bg-white/15'
                        }`}
                        title={perm.access === 'ro' ? t.users.roClickTip : t.users.rwClickTip}
                      >
                        {perm.access === 'rw' ? 'rw' : 'ro'}
                      </button>

                      <span className="text-xs text-gray-400 dark:text-white/30">
                        {perm.access === 'rw' ? t.users.readWrite : t.users.readOnly}
                      </span>

                      <button
                        type="button"
                        onClick={() => removePermission(perm.path)}
                        className="p-1 rounded text-gray-400 dark:text-white/30 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* API error */}
          {createUser.error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {createUser.error.message}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-white/60 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 transition-colors"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || createUser.isPending}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-gray-900 dark:text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createUser.isPending ? t.users.creating : t.users.createUser}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
