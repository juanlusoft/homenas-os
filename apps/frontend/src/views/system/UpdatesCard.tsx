import { useState, useRef, useEffect } from 'react'
import {
  RefreshCw,
  GitCommit,
  Package,
  Terminal,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { useUpdateStatus, useUpdateProcess, useUpdateApp, useUpdateOs } from '../../hooks/useUpdates'
import { cn } from '../../lib/utils'
import { useT } from '../../i18n/useT'

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 p-5 ${className}`}>
      {children}
    </div>
  )
}

function CardHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 text-gray-600 dark:text-gray-300">
      {icon}
      <span className="text-sm font-semibold uppercase tracking-wider">{title}</span>
    </div>
  )
}

// ─── Live output terminal ──────────────────────────────────────────────────────

function OutputTerminal({ output, waitingOutput }: { output: string; waitingOutput: string }) {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [output])

  return (
    <pre
      ref={ref}
      className="bg-black/40 border border-black/10 dark:border-white/10 rounded-lg p-3 text-xs font-mono text-green-700 dark:text-green-400 max-h-48 overflow-y-auto whitespace-pre-wrap break-all"
    >
      {output || waitingOutput}
    </pre>
  )
}

// ─── UpdatesCard ──────────────────────────────────────────────────────────────

export function UpdatesCard() {
  const t = useT()
  const statusQuery = useUpdateStatus()
  const processQuery = useUpdateProcess()
  const updateApp = useUpdateApp()
  const updateOs = useUpdateOs()

  const [showOsConfirm, setShowOsConfirm] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  // Capture pending commits before updating so we can show them as changelog
  const [appliedCommits, setAppliedCommits] = useState<string[]>([])
  const [reloadCountdown, setReloadCountdown] = useState<number | null>(null)

  const status = statusQuery.data
  const process = processQuery.data

  const isUpdating = process?.status === 'updating'
  const isDone = process?.status === 'done' && process?.type === 'app'
  const isError = process?.status === 'error'

  const pendingCount = status?.app.pendingCommits.length ?? 0
  const osPackageCount = status?.os.packages.length ?? 0

  // Auto-reload countdown after app update completes
  useEffect(() => {
    if (!isDone) return
    setReloadCountdown(5)
    const interval = setInterval(() => {
      setReloadCountdown((n) => {
        if (n === null || n <= 1) {
          clearInterval(interval)
          window.location.reload()
          return null
        }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [isDone])

  const handleUpdateApp = () => {
    // Capture current pending commits as changelog
    setAppliedCommits(status?.app.pendingCommits ?? [])
    updateApp.mutate(undefined, {
      onSuccess: () => setShowOutput(true),
    })
  }

  const handleUpdateOs = () => {
    setShowOsConfirm(false)
    updateOs.mutate(undefined, {
      onSuccess: () => setShowOutput(true),
    })
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
          <RefreshCw className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-semibold uppercase tracking-wider">{t.system.updates}</span>
        </div>
        {statusQuery.isFetching && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 dark:text-white/30" />
        )}
      </div>

      {statusQuery.isError ? (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>{t.updates.failedToCheck}</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* App update section */}
          <div className="flex items-center justify-between py-2 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <div>
                <p className="text-sm text-gray-900 dark:text-white font-medium">{t.updates.application}</p>
                {status && (
                  <p className="text-xs text-gray-500 dark:text-white/40 font-mono mt-0.5">
                    {status.app.currentCommit}
                    {pendingCount > 0 && (
                      <span className="ml-2 text-amber-600 dark:text-amber-400">
                        {t.updates.commitsAvailable(pendingCount)}
                      </span>
                    )}
                    {pendingCount === 0 && status && (
                      <span className="ml-2 text-green-700 dark:text-green-400">{t.updates.upToDate}</span>
                    )}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleUpdateApp}
              disabled={isUpdating || updateApp.isPending}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                pendingCount > 0
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-black/5 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:text-gray-700 dark:text-white/70 hover:bg-black/10 dark:bg-white/10',
                (isUpdating || updateApp.isPending) && 'opacity-50 cursor-not-allowed',
              )}
            >
              {(isUpdating && process?.type === 'app') || updateApp.isPending ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> {t.updates.updating}</>
              ) : (
                <><RefreshCw className="w-3 h-3" /> {t.updates.updateApp}</>
              )}
            </button>
          </div>

          {/* Pending commits list */}
          {status && pendingCount > 0 && (
            <div className="pl-6">
              <ul className="space-y-1 max-h-24 overflow-y-auto">
                {status.app.pendingCommits.map((commit, i) => (
                  <li key={i} className="text-xs font-mono text-gray-500 dark:text-white/50 truncate">{commit}</li>
                ))}
              </ul>
            </div>
          )}

          {/* OS updates section */}
          <div className="flex items-center justify-between py-2 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <div>
                <p className="text-sm text-gray-900 dark:text-white font-medium">{t.updates.systemPackages}</p>
                {status && (
                  <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
                    {osPackageCount > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">{t.updates.packagesAvailable(osPackageCount)}</span>
                    ) : statusQuery.isSuccess ? (
                      <span className="text-green-700 dark:text-green-400">{t.updates.upToDate}</span>
                    ) : null}
                  </p>
                )}
              </div>
            </div>

            {!showOsConfirm ? (
              <button
                onClick={() => setShowOsConfirm(true)}
                disabled={isUpdating || updateOs.isPending || osPackageCount === 0}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  osPackageCount > 0
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-black/5 dark:bg-white/5 text-gray-500 dark:text-white/40',
                  (isUpdating || updateOs.isPending || osPackageCount === 0) && 'opacity-50 cursor-not-allowed',
                )}
              >
                {(isUpdating && process?.type === 'os') || updateOs.isPending ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> {t.updates.updating}</>
                ) : (
                  <><Package className="w-3 h-3" /> {t.updates.updateSystem}</>
                )}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-600 dark:text-amber-400">{t.updates.areYouSure}</span>
                <button
                  onClick={handleUpdateOs}
                  className="px-2.5 py-1 text-xs bg-amber-600 hover:bg-amber-500 text-gray-900 dark:text-white rounded-lg transition-colors"
                >
                  {t.updates.yesUpdate}
                </button>
                <button
                  onClick={() => setShowOsConfirm(false)}
                  className="px-2.5 py-1 text-xs text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {t.common.cancel}
                </button>
              </div>
            )}
          </div>

          {/* OS package list (collapsed, expandable) */}
          {status && osPackageCount > 0 && (
            <div className="pl-6">
              <div className="max-h-28 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {status.os.packages.slice(0, 50).map((pkg) => (
                      <tr key={pkg.name} className="border-b border-black/5 dark:border-white/5 last:border-0">
                        <td className="py-1 font-mono text-gray-700 dark:text-white/70">{pkg.name}</td>
                        <td className="py-1 text-gray-400 dark:text-white/30 text-right font-mono">→ {pkg.newVersion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {osPackageCount > 50 && (
                  <p className="text-xs text-gray-400 dark:text-white/30 mt-1">… and {osPackageCount - 50} more</p>
                )}
              </div>
            </div>
          )}

          {/* Process state */}
          {(isUpdating || isDone || isError || showOutput) && process && (
            <div className="pt-1 space-y-3">
              {/* Status badge + countdown */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs text-gray-600 dark:text-white/60 uppercase tracking-wider">{t.updates.output}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isUpdating && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                      <Loader2 className="w-3 h-3 animate-spin" /> {t.updates.updating}
                    </span>
                  )}
                  {isDone && reloadCountdown !== null && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                      <CheckCircle className="w-3 h-3" />
                      {t.updates.reloadingIn(reloadCountdown ?? 0)}
                    </span>
                  )}
                  {isError && (
                    <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                      <AlertTriangle className="w-3 h-3" /> Error
                    </span>
                  )}
                </div>
              </div>

              {/* Changelog: commits applied */}
              {isDone && appliedCommits.length > 0 && (
                <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3">
                  <p className="text-xs text-green-700 dark:text-green-400 font-semibold mb-1.5">{t.updates.changesApplied}</p>
                  <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                    {appliedCommits.map((commit, i) => (
                      <li key={i} className="text-xs font-mono text-gray-500 dark:text-white/50 truncate">• {commit}</li>
                    ))}
                  </ul>
                </div>
              )}

              <OutputTerminal output={process.output} waitingOutput={t.updates.waitingOutput} />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
