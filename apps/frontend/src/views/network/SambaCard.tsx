import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { FolderOpen, Plus, Pencil, Trash2, Users, X } from 'lucide-react'
import {
  useSambaShares,
  useSambaSessions,
  useCreateSambaShare,
  useUpdateSambaShare,
  useDeleteSambaShare,
} from '../../hooks/useNetwork'
import type { SambaShare, CreateSambaShareInput } from '@homenas/shared'

// ─── ShareModal ───────────────────────────────────────────────────────────────

interface ShareModalProps {
  existing?: SambaShare
  onClose: () => void
}

function ShareModal({ existing, onClose }: ShareModalProps) {
  const createShare = useCreateSambaShare()
  const updateShare = useUpdateSambaShare()
  const isEdit = Boolean(existing)

  const { register, handleSubmit, formState: { errors } } = useForm<CreateSambaShareInput>({
    defaultValues: existing
      ? {
          name: existing.name,
          path: existing.path,
          comment: existing.comment ?? '',
          readonly: !existing.writable,
          guestOk: existing.public,
          validUsers: existing.validUsers.join(', '),
        }
      : { name: '', path: '', comment: '', readonly: false, guestOk: false, validUsers: '' },
  })

  const onSubmit = async (data: CreateSambaShareInput) => {
    try {
      if (isEdit && existing) {
        await updateShare.mutateAsync({
          name: existing.name,
          fields: {
            path: data.path,
            comment: data.comment,
            readonly: data.readonly,
            guestOk: data.guestOk,
            validUsers: data.validUsers,
          },
        })
      } else {
        await createShare.mutateAsync(data)
      }
      onClose()
    } catch {
      // error shown below
    }
  }

  const isPending = createShare.isPending || updateShare.isPending
  const mutationError = createShare.error ?? updateShare.error

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10">
          <h2 className="text-gray-900 dark:text-white font-semibold">
            {isEdit ? `Edit Share "${existing!.name}"` : 'New Samba Share'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 hover:bg-black/5 dark:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-white/60 mb-1.5">Share Name</label>
            <input
              {...register('name', {
                required: 'Name is required',
                pattern: {
                  value: /^[a-zA-Z0-9_-]{1,32}$/,
                  message: 'Only letters, numbers, _ and - (max 32 chars)',
                },
              })}
              disabled={isEdit}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              placeholder="e.g. media"
            />
            {errors.name && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-white/60 mb-1.5">Path</label>
            <input
              {...register('path', { required: 'Path is required' })}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white font-mono placeholder-white/30 focus:outline-none focus:border-indigo-500"
              placeholder="/mnt/data/media"
            />
            {errors.path && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.path.message}</p>}
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-white/60 mb-1.5">Comment</label>
            <input
              {...register('comment')}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500"
              placeholder="Optional description"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-white/60 mb-1.5">Valid Users</label>
            <input
              {...register('validUsers')}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500"
              placeholder="user1, user2 (leave empty for all)"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('readonly')}
                className="w-4 h-4 rounded border-white/20 bg-black/5 dark:bg-white/5 accent-indigo-500"
              />
              <span className="text-sm text-gray-600 dark:text-white/60">Read-only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('guestOk')}
                className="w-4 h-4 rounded border-white/20 bg-black/5 dark:bg-white/5 accent-indigo-500"
              />
              <span className="text-sm text-gray-600 dark:text-white/60">Allow guests</span>
            </label>
          </div>

          {mutationError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {mutationError.message}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg bg-black/5 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/10 dark:bg-white/10 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-gray-900 dark:text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Share'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── ShareRow ─────────────────────────────────────────────────────────────────

interface ShareRowProps {
  share: SambaShare
  onEdit: (share: SambaShare) => void
  onDelete: (name: string) => void
  isDeleting: boolean
}

function ShareRow({ share, onEdit, onDelete, isDeleting }: ShareRowProps) {
  return (
    <tr className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:bg-white/5 transition-colors">
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-white/80">{share.name}</span>
        {share.comment && (
          <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5">{share.comment}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-indigo-700 dark:text-indigo-300">{share.path}</span>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
          share.public ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' : 'bg-black/10 dark:bg-white/10 text-gray-500 dark:text-white/40'
        }`}>
          {share.public ? 'Guest' : 'Private'}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
          share.writable ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-black/10 dark:bg-white/10 text-gray-500 dark:text-white/40'
        }`}>
          {share.writable ? 'RW' : 'RO'}
        </span>
      </td>
      <td className="px-4 py-3">
        {share.validUsers.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
            <span className="text-xs text-gray-500 dark:text-white/50">{share.validUsers.join(', ')}</span>
          </div>
        ) : (
          <span className="text-gray-400 dark:text-white/30 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(share)}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(share.name)}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-black/5 dark:border-white/5">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-black/10 dark:bg-white/10 rounded animate-pulse" style={{ width: `${50 + (i * 13) % 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

// ─── SambaCard ────────────────────────────────────────────────────────────────

type Tab = 'shares' | 'sessions'

function ConnectedBadge({ count }: { count: number }) {
  const hasConn = count > 0
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
        hasConn
          ? 'bg-green-500/20 text-green-700 dark:text-green-400'
          : 'bg-black/10 dark:bg-white/10 text-gray-500 dark:text-white/40'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${hasConn ? 'bg-green-400 animate-pulse' : 'bg-gray-400 dark:bg-white/30'}`} />
      {hasConn ? `${count} connected` : 'no clients'}
    </span>
  )
}

export function SambaCard() {
  const { data: shares, isLoading: sharesLoading, error: sharesError } = useSambaShares()
  const { data: sessions, isLoading: sessionsLoading } = useSambaSessions()
  const deleteShare = useDeleteSambaShare()

  const [activeTab, setActiveTab] = useState<Tab>('shares')
  const [showModal, setShowModal] = useState(false)
  const [editingShare, setEditingShare] = useState<SambaShare | undefined>(undefined)

  const handleDelete = (name: string) => {
    if (confirm(`Delete share "${name}"? This cannot be undone.`)) {
      deleteShare.mutate(name)
    }
  }

  const handleEdit = (share: SambaShare) => {
    setEditingShare(share)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingShare(undefined)
  }

  return (
    <>
      <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3">
          <FolderOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Samba Shares</h2>
          {shares && (
            <span className="text-xs text-gray-500 dark:text-white/40">
              {shares.length} share{shares.length !== 1 ? 's' : ''}
            </span>
          )}
          {!sessionsLoading && sessions !== undefined && (
            <ConnectedBadge count={sessions.length} />
          )}
          <button
            onClick={() => { setEditingShare(undefined); setShowModal(true) }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-gray-900 dark:text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Share
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-black/10 dark:border-white/10">
          {(['shares', 'sessions'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors ${
                activeTab === tab
                  ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-400 -mb-px'
                  : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:text-white/70'
              }`}
            >
              {tab === 'sessions' ? 'Active Sessions' : 'Shares'}
            </button>
          ))}
        </div>

        {/* Shares Tab */}
        {activeTab === 'shares' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Path</th>
                  <th className="px-4 py-3 text-left font-medium">Guest</th>
                  <th className="px-4 py-3 text-left font-medium">Perms</th>
                  <th className="px-4 py-3 text-left font-medium">Valid Users</th>
                  <th className="px-4 py-3 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sharesLoading && Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)}
                {sharesError && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-red-600 dark:text-red-400 text-sm">
                      Error loading Samba shares
                    </td>
                  </tr>
                )}
                {shares && shares.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-400 dark:text-white/30 text-sm">
                      No Samba shares configured
                    </td>
                  </tr>
                )}
                {shares?.map((share) => (
                  <ShareRow
                    key={share.name}
                    share={share}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    isDeleting={deleteShare.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-medium">Share / User</th>
                  <th className="px-4 py-3 text-left font-medium">Machine</th>
                  <th className="px-4 py-3 text-left font-medium">PID</th>
                  <th className="px-4 py-3 text-left font-medium">Connected At</th>
                </tr>
              </thead>
              <tbody>
                {sessionsLoading && Array.from({ length: 2 }).map((_, i) => (
                  <tr key={i} className="border-b border-black/5 dark:border-white/5">
                    {Array.from({ length: 4 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-black/10 dark:bg-white/10 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))}
                {!sessionsLoading && (!sessions || sessions.length === 0) && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-400 dark:text-white/30 text-sm">
                      No active sessions
                    </td>
                  </tr>
                )}
                {sessions?.map((session, i) => (
                  <tr key={i} className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-white/80">{session.user}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-indigo-700 dark:text-indigo-300">{session.machine}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-500 dark:text-white/50">{session.pid}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 dark:text-white/50">{session.connectedAt}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <ShareModal
          existing={editingShare}
          onClose={handleCloseModal}
        />
      )}
    </>
  )
}
