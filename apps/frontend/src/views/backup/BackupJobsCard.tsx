import { Play, Pencil, Trash2, History, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import type { BackupJob } from '@homenas/shared'
import { useRunBackupJob, useDeleteBackupJob } from '../../hooks/useBackup'

function formatUnixDate(ts: number | null): string {
  if (!ts) return 'Never'
  return new Date(ts * 1000).toLocaleString()
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return ''
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function TypeBadge({ type }: { type: BackupJob['type'] }) {
  switch (type) {
    case 'rsync':
      return (
        <span className="inline-flex items-center text-xs text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded font-mono">
          rsync
        </span>
      )
    case 'tar':
      return (
        <span className="inline-flex items-center text-xs text-orange-600 dark:text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded font-mono">
          tar
        </span>
      )
    case 'rclone':
      return (
        <span className="inline-flex items-center text-xs text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded font-mono">
          rclone
        </span>
      )
    default:
      return null
  }
}

function LastStatusBadge({ status }: { status: BackupJob['lastStatus'] }) {
  switch (status) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
          <CheckCircle className="w-3 h-3" />
          Success
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
          <XCircle className="w-3 h-3" />
          Error
        </span>
      )
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
          <Loader2 className="w-3 h-3 animate-spin" />
          Running
        </span>
      )
    case 'never':
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-white/30 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
          <Clock className="w-3 h-3" />
          Never
        </span>
      )
  }
}

interface Props {
  job: BackupJob
  isRunning: boolean
  onEdit: (job: BackupJob) => void
  onHistory: (job: BackupJob) => void
}

export function BackupJobCard({ job, isRunning, onEdit, onHistory }: Props) {
  const runJob = useRunBackupJob()
  const deleteJob = useDeleteBackupJob()

  const handleDelete = () => {
    if (!window.confirm(`Delete backup job "${job.name}"? This cannot be undone.`)) return
    deleteJob.mutate(job.id)
  }

  return (
    <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">{job.name}</h3>
            <TypeBadge type={job.type} />
            {!job.enabled && (
              <span className="text-xs text-gray-400 dark:text-white/30 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">Disabled</span>
            )}
          </div>
          {job.description && (
            <p className="text-sm text-gray-500 dark:text-white/40 mt-1 truncate">{job.description}</p>
          )}
        </div>
      </div>

      {/* Source → Destination */}
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className="text-gray-500 dark:text-white/50 truncate max-w-[45%]">{job.source}</span>
        <span className="text-gray-400 dark:text-white/20 shrink-0">→</span>
        <span className="text-gray-500 dark:text-white/50 truncate max-w-[45%]">{job.destination}</span>
      </div>

      {/* Schedule + last run */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-gray-400 dark:text-white/30 mb-0.5">Schedule</p>
          {job.cronExpression ? (
            <code className="text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded text-xs">
              {job.cronExpression}
            </code>
          ) : (
            <span className="text-gray-500 dark:text-white/40">Manual</span>
          )}
        </div>
        <div>
          <p className="text-gray-400 dark:text-white/30 mb-0.5">Last run</p>
          <p className="text-gray-600 dark:text-white/60">{formatUnixDate(job.lastRun)}</p>
        </div>
        <div>
          <p className="text-gray-400 dark:text-white/30 mb-0.5">Status</p>
          <LastStatusBadge status={job.lastStatus} />
        </div>
        <div>
          <p className="text-gray-400 dark:text-white/30 mb-0.5">Duration</p>
          <p className="text-gray-600 dark:text-white/60">{formatDuration(job.lastDuration) || '—'}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-black/5 dark:border-white/5 flex-wrap">
        <button
          onClick={() => runJob.mutate(job.id)}
          disabled={runJob.isPending || isRunning}
          title={isRunning ? 'Another backup is running' : 'Run now'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-white/60 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="w-3 h-3" />
          Run Now
        </button>
        <button
          onClick={() => onHistory(job)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-white/60 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <History className="w-3 h-3" />
          History
        </button>
        <button
          onClick={() => onEdit(job)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-white/60 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </button>
        <button
          onClick={handleDelete}
          disabled={deleteJob.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-white/40 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors ml-auto disabled:opacity-50"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      </div>
    </div>
  )
}
