import { Loader2, XCircle } from 'lucide-react'
import type { BackupJob, BackupProgress } from '@homenas/shared'
import { useCancelBackup } from '../../hooks/useBackup'

interface Props {
  progress: BackupProgress
  jobs: BackupJob[]
}

export function BackupProgressCard({ progress, jobs }: Props) {
  const cancelBackup = useCancelBackup()

  if (!progress.running) return null

  const job = jobs.find((j) => j.id === progress.jobId)

  const handleCancel = () => {
    if (!window.confirm('Cancel the running backup? This may leave files in a partial state.')) return
    cancelBackup.mutate()
  }

  return (
    <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-indigo-500/30 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {job ? job.name : `Job #${progress.jobId}`}
            </h3>
            {job && (
              <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5 font-mono">
                {job.source} → {job.destination}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleCancel}
          disabled={cancelBackup.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
        >
          <XCircle className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-white/40">Progress</span>
          {progress.progress > 0 ? (
            <span className="text-gray-600 dark:text-white/60 font-mono">{progress.progress}%</span>
          ) : (
            <span className="text-gray-400 dark:text-white/30 italic">calculating…</span>
          )}
        </div>
        <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
          {progress.progress > 0 ? (
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          ) : (
            // Indeterminate animated bar
            <div className="h-full w-1/3 bg-indigo-500 rounded-full animate-[slide_1.5s_ease-in-out_infinite]" />
          )}
        </div>
      </div>

      {/* Live output */}
      {progress.output.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 dark:text-white/30 mb-1.5">Live output</p>
          <pre className="text-xs text-gray-500 dark:text-white/50 font-mono bg-black/30 rounded-lg p-3 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
            {progress.output.join('\n')}
          </pre>
        </div>
      )}

      {/* Error */}
      {progress.error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {progress.error}
        </p>
      )}
    </div>
  )
}
