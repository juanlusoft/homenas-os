import { X, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import type { BackupJob, BackupRun } from '@homenas/shared'
import { useBackupHistory } from '../../hooks/useBackup'

function formatUnixDate(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function StatusBadge({ status }: { status: BackupRun['status'] }) {
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
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
          <Clock className="w-3 h-3" />
          Cancelled
        </span>
      )
    default:
      return null
  }
}

interface Props {
  job: BackupJob
  onClose: () => void
}

export function BackupHistoryModal({ job, onClose }: Props) {
  const { data: runs, isLoading, error } = useBackupHistory(job.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Run History</h2>
            <p className="text-sm text-gray-500 dark:text-white/40 mt-0.5">{job.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 hover:bg-black/5 dark:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-spin" />
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
              <p className="text-red-600 dark:text-red-400 text-sm">Failed to load run history</p>
            </div>
          )}

          {runs && runs.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-white/40 text-sm">No runs yet for this job</p>
            </div>
          )}

          {runs && runs.length > 0 && (
            <div className="space-y-3">
              {runs.map((run) => (
                <details key={run.id} className="group bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg overflow-hidden">
                  <summary className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-black/5 dark:bg-white/5 transition-colors select-none list-none">
                    <StatusBadge status={run.status} />
                    <div className="flex-1 grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400 dark:text-white/30 text-xs">Started</p>
                        <p className="text-gray-700 dark:text-white/70 text-xs font-mono">{formatUnixDate(run.startedAt)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 dark:text-white/30 text-xs">Duration</p>
                        <p className="text-gray-700 dark:text-white/70 text-xs">{formatDuration(run.duration)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 dark:text-white/30 text-xs">Exit code</p>
                        <p className={`text-xs font-mono ${run.exitCode === 0 ? 'text-green-700 dark:text-green-400' : run.exitCode === null ? 'text-gray-400 dark:text-white/30' : 'text-red-600 dark:text-red-400'}`}>
                          {run.exitCode !== null ? run.exitCode : '—'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-white/30 group-open:hidden">Show output</span>
                    <span className="text-xs text-gray-400 dark:text-white/30 hidden group-open:inline">Hide output</span>
                  </summary>

                  {run.output ? (
                    <div className="px-4 pb-4">
                      <pre className="text-xs text-gray-500 dark:text-white/50 font-mono bg-black/30 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                        {run.output}
                      </pre>
                    </div>
                  ) : (
                    <div className="px-4 pb-4">
                      <p className="text-xs text-gray-400 dark:text-white/30 italic">No output captured</p>
                    </div>
                  )}
                </details>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/10 dark:border-white/10 shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-white/60 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
