import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import { CreateBackupJobSchema, type CreateBackupJobInput, type BackupJob } from '@homenas/shared'
import { useCreateBackupJob, useUpdateBackupJob } from '../../hooks/useBackup'

// Frontend form schema — extraArgs as comma-separated string for UX
const BackupJobFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(128),
  description: z.string().max(512).optional(),
  type: z.enum(['rsync', 'tar', 'rclone']),
  source: z.string().min(1, 'Source is required'),
  destination: z.string().min(1, 'Destination is required'),
  cronExpression: z.string().optional(),
  retentionDays: z.string().optional(),
  extraArgsRaw: z.string().optional(),
  enabled: z.boolean(),
})

type BackupJobFormValues = z.infer<typeof BackupJobFormSchema>

interface Props {
  job?: BackupJob
  onClose: () => void
}

export function BackupJobForm({ job, onClose }: Props) {
  const createJob = useCreateBackupJob()
  const updateJob = useUpdateBackupJob()
  const isEditing = !!job

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<BackupJobFormValues>({
    resolver: zodResolver(BackupJobFormSchema),
    defaultValues: {
      name: job?.name ?? '',
      description: job?.description ?? '',
      type: job?.type ?? 'rsync',
      source: job?.source ?? '',
      destination: job?.destination ?? '',
      cronExpression: job?.cronExpression ?? '',
      retentionDays: job?.retentionDays !== null && job?.retentionDays !== undefined
        ? String(job.retentionDays)
        : '',
      extraArgsRaw: job?.extraArgs.join(', ') ?? '',
      enabled: job?.enabled ?? true,
    },
  })

  const onSubmit = async (data: BackupJobFormValues) => {
    const extraArgs = data.extraArgsRaw
      ? data.extraArgsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : []

    const retentionDays = data.retentionDays && data.retentionDays.trim() !== ''
      ? parseInt(data.retentionDays, 10)
      : null

    const payload: CreateBackupJobInput = {
      name: data.name,
      description: data.description?.trim() || null,
      type: data.type,
      source: data.source,
      destination: data.destination,
      cronExpression: data.cronExpression?.trim() || null,
      enabled: data.enabled,
      retentionDays,
      extraArgs,
    }

    // Validate against shared schema
    const parsed = CreateBackupJobSchema.safeParse(payload)
    if (!parsed.success) return

    try {
      if (isEditing && job) {
        await updateJob.mutateAsync({ id: job.id, body: parsed.data })
      } else {
        await createJob.mutateAsync(parsed.data)
      }
      onClose()
    } catch {
      // error shown via mutation.error
    }
  }

  const mutationError = isEditing ? updateJob.error : createJob.error
  const isPending = isEditing ? updateJob.isPending : createJob.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 sticky top-0 bg-gray-100 dark:bg-gray-900 z-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditing ? 'Edit Backup Job' : 'New Backup Job'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 hover:bg-black/5 dark:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Name</label>
            <input
              {...register('name')}
              type="text"
              placeholder="Daily photos backup"
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">
              Description <span className="text-gray-400 dark:text-white/30">(optional)</span>
            </label>
            <textarea
              {...register('description')}
              rows={2}
              placeholder="What does this backup do?"
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Type</label>
            <select
              {...register('type')}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            >
              <option value="rsync">rsync — fast incremental sync</option>
              <option value="tar">tar — compressed archive</option>
              <option value="rclone">rclone — cloud/remote sync</option>
            </select>
            {errors.type && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.type.message}</p>}
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Source</label>
            <input
              {...register('source')}
              type="text"
              placeholder="/mnt/data/photos/"
              className="w-full font-mono bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            {errors.source && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.source.message}</p>}
          </div>

          {/* Destination */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Destination</label>
            <input
              {...register('destination')}
              type="text"
              placeholder="/mnt/backup/photos/ or remote:bucket/photos"
              className="w-full font-mono bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            {errors.destination && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.destination.message}</p>}
          </div>

          {/* Cron Expression */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">
              Schedule <span className="text-gray-400 dark:text-white/30">(cron expression, leave empty for manual)</span>
            </label>
            <input
              {...register('cronExpression')}
              type="text"
              placeholder="0 2 * * * (daily at 2am)"
              className="w-full font-mono bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300 placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-white/30">
              Format: min hour dom month dow — e.g. <span className="font-mono">0 2 * * *</span> = daily at 2am
            </p>
          </div>

          {/* Retention Days */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">
              Retention <span className="text-gray-400 dark:text-white/30">(days, optional)</span>
            </label>
            <input
              {...register('retentionDays')}
              type="number"
              min={1}
              max={365}
              placeholder="30"
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          {/* Extra Args */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">
              Extra arguments <span className="text-gray-400 dark:text-white/30">(comma-separated)</span>
            </label>
            <input
              {...register('extraArgsRaw')}
              type="text"
              placeholder="--delete, --exclude=*.tmp"
              className="w-full font-mono bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-white/30">Each comma-separated value becomes a separate argument</p>
          </div>

          {/* Enabled */}
          <div className="flex items-center gap-3">
            <Controller
              name="enabled"
              control={control}
              render={({ field }) => (
                <button
                  type="button"
                  role="switch"
                  aria-checked={field.value}
                  onClick={() => field.onChange(!field.value)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    field.value ? 'bg-indigo-600' : 'bg-white/20'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    field.value ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              )}
            />
            <label className="text-sm text-gray-700 dark:text-white/70">Enable job</label>
          </div>

          {/* API error */}
          {mutationError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {mutationError.message}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-white/60 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-gray-900 dark:text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
