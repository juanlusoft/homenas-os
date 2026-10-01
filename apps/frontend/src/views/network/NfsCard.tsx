import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { Share2, Plus, Pencil, Trash2, X } from 'lucide-react'
import {
  useNfsStatus,
  useCreateNfsExport,
  useUpdateNfsExport,
  useDeleteNfsExport,
} from '../../hooks/useNetwork'
import type { NfsExport, CreateNfsExportInput } from '@homenas/shared'

// ─── ExportModal ────────────────────────────────────────────────────────────────

interface ExportModalProps {
  existing?: NfsExport
  onClose: () => void
}

function ExportModal({ existing, onClose }: ExportModalProps) {
  const createExport = useCreateNfsExport()
  const updateExport = useUpdateNfsExport()
  const isEdit = Boolean(existing)

  const { register, handleSubmit, formState: { errors } } = useForm<CreateNfsExportInput>({
    defaultValues: existing
      ? { path: existing.path, clients: existing.clients, options: existing.options }
      : { path: '', clients: '', options: 'rw,sync,no_subtree_check' },
  })

  const onSubmit = async (data: CreateNfsExportInput) => {
    try {
      if (isEdit && existing) {
        await updateExport.mutateAsync({
          path: existing.path,
          fields: { clients: data.clients, options: data.options },
        })
      } else {
        await createExport.mutateAsync(data)
      }
      onClose()
    } catch {
      // error shown below
    }
  }

  const isPending = createExport.isPending || updateExport.isPending
  const mutationError = createExport.error ?? updateExport.error

  // Render via a portal to document.body: the card ancestor uses backdrop-blur,
  // which makes position:fixed anchor to the card instead of the viewport.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10">
          <h2 className="text-gray-900 dark:text-white font-semibold">
            {isEdit ? `Edit Export "${existing!.path}"` : 'New NFS Export'}
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
            <label className="block text-sm text-gray-600 dark:text-white/60 mb-1.5">Path</label>
            <input
              {...register('path', {
                required: 'Path is required',
                pattern: { value: /^\/.+/, message: 'Must be an absolute path (start with /)' },
              })}
              disabled={isEdit}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white font-mono placeholder-white/30 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              placeholder="/mnt/storage/media"
            />
            {errors.path && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.path.message}</p>}
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-white/60 mb-1.5">Clients</label>
            <input
              {...register('clients', { required: 'Clients is required' })}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white font-mono placeholder-white/30 focus:outline-none focus:border-indigo-500"
              placeholder="192.168.1.0/24  or  *"
            />
            {errors.clients && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.clients.message}</p>}
            <p className="text-xs text-gray-400 dark:text-white/30 mt-1">
              IP, subnet (192.168.1.0/24), hostname, or * for all
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-white/60 mb-1.5">Options</label>
            <input
              {...register('options', { required: 'Options are required' })}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white font-mono placeholder-white/30 focus:outline-none focus:border-indigo-500"
              placeholder="rw,sync,no_subtree_check"
            />
            {errors.options && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.options.message}</p>}
            <p className="text-xs text-gray-400 dark:text-white/30 mt-1">
              e.g. rw,sync,no_subtree_check (fsid is added automatically)
            </p>
          </div>

          {mutationError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {mutationError instanceof Error ? mutationError.message : 'Operation failed'}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              {isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

// ─── Rows ───────────────────────────────────────────────────────────────────────

function NfsRow({ export_: exp, onEdit, onDelete }: { export_: NfsExport; onEdit: () => void; onDelete: () => void }) {
  return (
    <tr className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:bg-white/5 transition-colors">
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-indigo-700 dark:text-indigo-300">{exp.path}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-gray-700 dark:text-white/70">{exp.clients}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-gray-500 dark:text-white/50 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">{exp.options}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-black/5 dark:border-white/5">
      {Array.from({ length: 4 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-black/10 dark:bg-white/10 rounded animate-pulse" style={{ width: `${50 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

function ConnectedClientsBadge({ clients }: { clients: string[] }) {
  const hasClients = clients.length > 0
  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
          hasClients
            ? 'bg-green-500/20 text-green-700 dark:text-green-400'
            : 'bg-red-500/20 text-red-600 dark:text-red-400'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            hasClients ? 'bg-green-400 animate-pulse' : 'bg-red-400'
          }`}
        />
        {hasClients ? `${clients.length} connected` : 'no clients'}
      </span>
      {hasClients && (
        <div className="flex flex-col items-end gap-0.5 mt-0.5">
          {clients.map((ip) => (
            <span key={ip} className="text-xs font-mono text-gray-500 dark:text-white/50">
              {ip}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function NfsCard() {
  const { data: status, isLoading, error } = useNfsStatus()
  const deleteExport = useDeleteNfsExport()
  const exports_ = status?.exports
  const connectedClients = status?.connectedClients ?? []

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<NfsExport | undefined>(undefined)

  const openCreate = () => { setEditing(undefined); setShowModal(true) }
  const openEdit = (exp: NfsExport) => { setEditing(exp); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditing(undefined) }

  const handleDelete = (exp: NfsExport) => {
    if (window.confirm(`Delete NFS export "${exp.path}"?`)) {
      deleteExport.mutate(exp.path)
    }
  }

  return (
    <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3">
        <Share2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h2 className="font-semibold text-gray-900 dark:text-white">NFS Exports</h2>
        <div className="ml-auto flex items-center gap-3">
          {exports_ && (
            <span className="text-xs text-gray-500 dark:text-white/40">
              {exports_.length} export{exports_.length !== 1 ? 's' : ''}
            </span>
          )}
          {!isLoading && (
            <ConnectedClientsBadge clients={connectedClients} />
          )}
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add export
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-medium">Path</th>
              <th className="px-4 py-3 text-left font-medium">Clients</th>
              <th className="px-4 py-3 text-left font-medium">Options</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)}
            {error && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-red-600 dark:text-red-400 text-sm">
                  Error loading NFS exports
                </td>
              </tr>
            )}
            {exports_ && exports_.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400 dark:text-white/30 text-sm">
                  No NFS exports configured
                </td>
              </tr>
            )}
            {exports_?.map((exp, idx) => (
              <NfsRow
                key={`${exp.path}-${idx}`}
                export_={exp}
                onEdit={() => openEdit(exp)}
                onDelete={() => handleDelete(exp)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {showModal && <ExportModal existing={editing} onClose={closeModal} />}
    </div>
  )
}
