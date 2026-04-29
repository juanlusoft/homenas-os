import { useState } from 'react'
import { Globe, ExternalLink, Loader2, Play, Square, Trash2, Settings } from 'lucide-react'
import { useCloudflareStatus, useStartTunnel, useStopTunnel, useRemoveTunnel } from '../../hooks/useCloudflare'
import { CloudflareConfigModal } from './CloudflareConfigModal'
import { useT } from '../../i18n/useT'

export function CloudflareCard() {
  const { data: status, isLoading, error } = useCloudflareStatus()
  const startTunnel = useStartTunnel()
  const stopTunnel = useStopTunnel()
  const removeTunnel = useRemoveTunnel()
  const [showConfigModal, setShowConfigModal] = useState(false)
  const t = useT()

  return (
    <>
      <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3">
          <Globe className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          <h2 className="font-semibold text-gray-900 dark:text-white">{t.network.cloudflareTitle}</h2>

          {/* Status badge */}
          {status && status.configured && (
            <span
              className={[
                'ml-1 text-xs px-2 py-0.5 rounded font-medium',
                !status.installed
                  ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                  : status.running
                  ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                  : 'bg-black/10 dark:bg-white/10 text-gray-500 dark:text-white/40',
              ].join(' ')}
            >
              {!status.installed ? t.common.applying : status.running ? t.common.active : t.docker.stopped}
            </span>
          )}

          {/* Action buttons in header */}
          <div className="ml-auto flex items-center gap-2">
            {status?.configured && (
              <>
                <button
                  onClick={() => setShowConfigModal(true)}
                  className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-700 dark:text-white/70 hover:bg-black/10 dark:bg-white/10 transition-colors"
                  title={t.network.reconfigureToken}
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeTunnel.mutate()}
                  disabled={removeTunnel.isPending}
                  className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  title={t.network.deleteConfig}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-4 bg-black/10 dark:bg-white/10 rounded animate-pulse" style={{ width: `${50 + i * 20}%` }} />
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{t.network.failedToLoad}</p>
          )}

          {/* Not configured */}
          {status && !status.configured && (
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-white/70 font-medium">{t.network.cloudflareNotConfigured}</p>
                <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
                  Accede a tu NAS desde cualquier lugar sin abrir puertos en el router.
                </p>
              </div>
              <button
                onClick={() => setShowConfigModal(true)}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-gray-900 dark:text-white text-sm font-semibold transition-colors"
              >
                <Settings className="w-4 h-4" />
                {t.common.edit}
              </button>
            </div>
          )}

          {/* Installing */}
          {status?.configured && !status.installed && (
            <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400">
              <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
              <span className="text-sm">{t.common.applying}</span>
            </div>
          )}

          {/* Configured + Running */}
          {status?.configured && status.installed && status.running && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {status.tunnelUrl && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-white/40 mb-0.5">URL del tunnel</p>
                    <a
                      href={status.tunnelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:text-indigo-300 transition-colors"
                    >
                      {status.tunnelUrl}
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                    </a>
                  </div>
                )}
                {status.connectorId && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-white/40 mb-0.5">Connector ID</p>
                    <p className="text-xs font-mono text-gray-600 dark:text-white/60 truncate">{status.connectorId}</p>
                  </div>
                )}
              </div>

              <div>
                <button
                  onClick={() => stopTunnel.mutate()}
                  disabled={stopTunnel.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:bg-white/15 text-gray-900 dark:text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {stopTunnel.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  {stopTunnel.isPending ? t.common.applying : t.common.stop}
                </button>
              </div>
            </div>
          )}

          {/* Configured + Stopped */}
          {status?.configured && status.installed && !status.running && (
            <div className="space-y-3">
              {status.lastError && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 font-mono">
                  {status.lastError}
                </p>
              )}
              <button
                onClick={() => startTunnel.mutate()}
                disabled={startTunnel.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-gray-900 dark:text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {startTunnel.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {startTunnel.isPending ? t.common.applying : t.common.start}
              </button>
            </div>
          )}
        </div>
      </div>

      {showConfigModal && <CloudflareConfigModal onClose={() => setShowConfigModal(false)} />}
    </>
  )
}
