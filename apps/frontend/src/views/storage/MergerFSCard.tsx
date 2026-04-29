import { HardDrive, ArrowRightLeft, Loader2 } from 'lucide-react'
import { useMergerFSStatus, useDrainMergerFSCache } from '../../hooks/useStorage'
import { formatBytes } from '../../lib/utils'
import type { MergerFSDrive } from '@homenas/shared'
import { useT } from '../../i18n/useT'

const ROLE_STYLE: Record<MergerFSDrive['role'], string> = {
  data:    'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
  cache:   'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
  unknown: 'bg-black/5 dark:bg-white/5 text-gray-500 dark:text-white/40 border-black/10 dark:border-white/10',
}

export function MergerFSCard() {
  const { data: status, isLoading } = useMergerFSStatus()
  const drain = useDrainMergerFSCache()
  const t = useT()

  const roleLabel: Record<MergerFSDrive['role'], string> = {
    data: t.storage.dataLabel, cache: t.storage.cacheLabel, unknown: '?',
  }

  const usagePct =
    status?.totalBytes && status?.usedBytes
      ? Math.min(100, (status.usedBytes / status.totalBytes) * 100)
      : null

  const barColor = usagePct !== null
    ? usagePct > 90 ? 'bg-red-500' : usagePct > 70 ? 'bg-yellow-500' : 'bg-indigo-500'
    : 'bg-indigo-500'

  return (
    <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl shadow-lg p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardDrive className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="font-semibold text-gray-900 dark:text-white">{t.storage.mergerfs}</h2>
        </div>
        {status && (
          status.mounted
            ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-500/20 text-green-300 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                {t.storage.mounted.toUpperCase()}
              </span>
            )
            : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-black/10 dark:bg-white/10 text-gray-500 dark:text-white/40 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                {t.storage.notMounted.toUpperCase()}
              </span>
            )
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 bg-black/10 dark:bg-white/10 rounded animate-pulse" />
          ))}
        </div>
      )}

      {status && (
        <>
          {/* Mount point */}
          <div className="bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2 text-xs">
            <span className="text-gray-500 dark:text-white/40 mr-2">{t.storage.mountPoint}</span>
            <span className="font-mono text-gray-700 dark:text-white/70">{status.mountPoint}</span>
          </div>

          {/* Contributing drives */}
          {status.drives.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500 dark:text-white/40">{t.storage.contributingDisks} ({status.drives.length})</p>
              {status.drives.map((drive) => (
                <div key={drive.path} className="flex items-center justify-between bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${ROLE_STYLE[drive.role]} shrink-0`}>
                      {roleLabel[drive.role]}
                    </span>
                    <span className="text-xs font-mono text-gray-600 dark:text-white/60 truncate">{drive.path}</span>
                  </div>
                  {drive.totalBytes != null && (
                    <span className="text-xs text-gray-500 dark:text-white/40 tabular-nums shrink-0 ml-2">
                      {formatBytes(drive.usedBytes ?? 0)} / {formatBytes(drive.totalBytes)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-white/30">No se detectaron discos configurados</p>
          )}

          {/* Space usage */}
          {status.mounted && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 dark:text-white/40">{t.storage.usedSpace}</span>
                <span className="text-gray-600 dark:text-white/60 tabular-nums">
                  {status.usedBytes != null ? formatBytes(status.usedBytes) : '—'}
                  {' / '}
                  {status.totalBytes != null ? formatBytes(status.totalBytes) : '—'}
                </span>
              </div>
              <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${usagePct ?? 0}%` }}
                />
              </div>
              {usagePct !== null && (
                <p className="text-right text-xs text-gray-400 dark:text-white/30 tabular-nums">{usagePct.toFixed(1)}% usado</p>
              )}
            </div>
          )}

          {!status.mounted && (
            <p className="text-xs text-gray-400 dark:text-white/30 italic">
              El pool no está montado. Verifica la configuración de MergerFS.
            </p>
          )}

          {/* Manual cache drain */}
          {status.mounted && status.drives.some(d => d.role === 'cache') && (
            <div className="border-t border-black/5 dark:border-white/5 pt-3">
              {drain.isError && (
                <p className="text-xs text-red-600 dark:text-red-400 mb-2">{(drain.error as Error)?.message}</p>
              )}
              <button
                onClick={() => drain.mutate()}
                disabled={drain.isPending}
                className="flex items-center gap-1.5 text-xs font-medium bg-purple-500/20 hover:bg-purple-500/30 text-purple-700 dark:text-purple-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 w-full justify-center"
              >
                {drain.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Vaciando caché...</>
                  : <><ArrowRightLeft className="w-3.5 h-3.5" />Vaciar caché ahora</>
                }
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
