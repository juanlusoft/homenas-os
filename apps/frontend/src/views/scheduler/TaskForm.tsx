import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Clock } from 'lucide-react'
import { CreateTaskSchema, type CreateTaskInput, type ScheduledTask } from '@homenas/shared'
import { useCreateTask, useUpdateTask } from '../../hooks/useScheduler'

// Frontend form schema — args as comma-separated string for UX
const TaskFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(128),
  description: z.string().max(512).optional(),
  cronExpression: z.string().min(1, 'Cron expression is required'),
  command: z.string().min(1, 'Command is required').max(256),
  argsRaw: z.string().optional(), // comma-separated
  enabled: z.boolean(),
})

type TaskFormValues = z.infer<typeof TaskFormSchema>

// Simple next-runs preview — just compute based on current minute and cron-like logic
function getNextRunsPreview(cronExpr: string): string[] {
  // We can't compute real next runs without a library, so display a helper message
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length !== 5) return []

  const [min, hour] = parts
  const previews: string[] = []
  const now = new Date()

  try {
    // Simple preview: show next 3 occurrences based on current time + 1/2/3 units
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now)
      if (min === '*' && hour === '*') {
        d.setMinutes(d.getMinutes() + i)
        d.setSeconds(0)
      } else if (min !== '*' && hour === '*') {
        const targetMin = parseInt(min, 10)
        d.setMinutes(targetMin + (i - 1) * 60)
        d.setSeconds(0)
      } else if (min === '*' && hour !== '*') {
        const targetHour = parseInt(hour, 10)
        d.setHours(targetHour + (i - 1), 0, 0)
      } else {
        const targetMin = parseInt(min, 10)
        const targetHour = parseInt(hour, 10)
        if (!isNaN(targetMin) && !isNaN(targetHour)) {
          d.setHours(targetHour + (i - 1) * 24, targetMin, 0)
        } else {
          break
        }
      }
      previews.push(d.toLocaleString())
    }
  } catch {
    // ignore
  }

  return previews
}

interface Props {
  task?: ScheduledTask
  onClose: () => void
}

export function TaskForm({ task, onClose }: Props) {
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const isEditing = !!task

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(TaskFormSchema),
    defaultValues: {
      name: task?.name ?? '',
      description: task?.description ?? '',
      cronExpression: task?.cronExpression ?? '0 * * * *',
      command: task?.command ?? '',
      argsRaw: task?.args.join(', ') ?? '',
      enabled: task?.enabled ?? true,
    },
  })

  const cronExpression = watch('cronExpression')
  const nextRuns = getNextRunsPreview(cronExpression)

  const onSubmit = async (data: TaskFormValues) => {
    const args = data.argsRaw
      ? data.argsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : []

    const payload: CreateTaskInput = {
      name: data.name,
      description: data.description ?? null,
      cronExpression: data.cronExpression,
      command: data.command,
      args,
      enabled: data.enabled,
    }

    try {
      if (isEditing && task) {
        await updateTask.mutateAsync({ id: task.id, body: payload })
      } else {
        await createTask.mutateAsync(payload)
      }
      onClose()
    } catch {
      // error shown via mutation.error
    }
  }

  const mutationError = isEditing ? updateTask.error : createTask.error
  const isPending = isEditing ? updateTask.isPending : createTask.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 sticky top-0 bg-gray-100 dark:bg-gray-900 z-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditing ? 'Edit Task' : 'New Task'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 hover:bg-black/5 dark:bg-white/5 transition-colors">
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
              placeholder="Backup database"
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
              placeholder="What does this task do?"
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
            />
          </div>

          {/* Cron Expression */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">
              Cron Expression
            </label>
            <input
              {...register('cronExpression')}
              type="text"
              placeholder="0 * * * *"
              className="w-full font-mono bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300 placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            {errors.cronExpression && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.cronExpression.message}</p>
            )}

            {/* Next runs preview */}
            {nextRuns.length > 0 && (
              <div className="mt-2 p-2.5 bg-black/5 dark:bg-white/5 rounded-lg">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/40 mb-1.5">
                  <Clock className="w-3 h-3" />
                  Next ~3 runs (approx.)
                </div>
                {nextRuns.map((t, i) => (
                  <div key={i} className="text-xs text-gray-600 dark:text-white/60 font-mono">{t}</div>
                ))}
              </div>
            )}

            <p className="mt-1 text-xs text-gray-400 dark:text-white/30">
              Format: min hour dom month dow (e.g. <span className="font-mono">0 2 * * *</span> = daily at 2am)
            </p>
          </div>

          {/* Command */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Command</label>
            <input
              {...register('command')}
              type="text"
              placeholder="/usr/bin/rsync"
              className="w-full font-mono bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            {errors.command && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.command.message}</p>}
          </div>

          {/* Args */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">
              Arguments <span className="text-gray-400 dark:text-white/30">(comma-separated)</span>
            </label>
            <input
              {...register('argsRaw')}
              type="text"
              placeholder="-av, /source/, /dest/"
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
            <label className="text-sm text-gray-700 dark:text-white/70">Enable task on creation</label>
          </div>

          {/* API error */}
          {mutationError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {mutationError.message}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-white/60 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-gray-900 dark:text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
