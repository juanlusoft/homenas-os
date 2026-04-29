import { useState } from 'react'
import { Globe, RefreshCw, Plus, Trash2, CheckCircle, AlertTriangle, Clock, X } from 'lucide-react'
import { useDdnsConfigs, useAddDdnsConfig, useRemoveDdnsConfig, useUpdateDdnsNow } from '../../hooks/useDDNS'
import type { DdnsProvider, DdnsConfigInput } from '../../api/ddns'
import { cn } from '../../lib/utils'
import { useT } from '../../i18n/useT'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROVIDERS: Array<{ value: DdnsProvider; label: string; tokenLabel: string; tokenPlaceholder: string; hasUsername: boolean }> = [
  { value: 'duckdns', label: 'DuckDNS', tokenLabel: 'Token', tokenPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hasUsername: false },
  { value: 'noip', label: 'No-IP', tokenLabel: 'Password', tokenPlaceholder: 'Your No-IP password', hasUsername: true },
  { value: 'cloudflare', label: 'Cloudflare', tokenLabel: 'Zone:Record:APIToken', tokenPlaceholder: 'zoneId:recordId:apiToken', hasUsername: false },
  { value: 'dynu', label: 'Dynu', tokenLabel: 'Password', tokenPlaceholder: 'Your Dynu password', hasUsername: false },
]

function formatRelativeTime(ts: number | null): string {
  if (!ts) return 'Never'
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-700 dark:text-green-400">
        <CheckCircle className="w-3 h-3" /> OK
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-600 dark:text-blue-400">
        <Clock className="w-3 h-3" /> Pending
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-600 dark:text-red-400" title={status}>
      <AlertTriangle className="w-3 h-3" /> Error
    </span>
  )
}

// ─── Add form ─────────────────────────────────────────────────────────────────

interface AddFormProps {
  onClose: () => void
}

function AddForm({ onClose }: AddFormProps) {
  const addConfig = useAddDdnsConfig()
  const [provider, setProvider] = useState<DdnsProvider>('duckdns')
  const [domain, setDomain] = useState('')
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const t = useT()

  const providerMeta = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0]!

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const input: DdnsConfigInput = {
      provider,
      domain: domain.trim(),
      token: token.trim(),
      ...(providerMeta.hasUsername && username.trim() ? { username: username.trim() } : {}),
    }
    addConfig.mutate(input, { onSuccess: onClose })
  }

  return (
    <div className="border border-black/10 dark:border-white/10 rounded-xl p-4 bg-black/5 dark:bg-white/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t.network.addDdns}</h3>
        <button onClick={onClose} className="p-1 rounded text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Provider */}
        <div>
          <label className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-wider block mb-1">{t.network.provider}</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as DdnsProvider)}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Domain */}
        <div>
          <label className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-wider block mb-1">{t.network.domainHostname}</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={provider === 'duckdns' ? 'yourname.duckdns.org' : 'yourhost.example.com'}
            required
            className="w-full bg-gray-100 dark:bg-gray-800 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:text-white/30 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Username (No-IP only) */}
        {providerMeta.hasUsername && (
          <div>
            <label className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-wider block mb-1">{t.users.username}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your No-IP username"
              required
              className="w-full bg-gray-100 dark:bg-gray-800 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:text-white/30 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}

        {/* Token */}
        <div>
          <label className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-wider block mb-1">{providerMeta.tokenLabel}</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={providerMeta.tokenPlaceholder}
            required
            className="w-full bg-gray-100 dark:bg-gray-800 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:text-white/30 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {addConfig.isError && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {addConfig.error instanceof Error ? addConfig.error.message : t.network.failedToLoad}
          </p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            {t.common.cancel}
          </button>
          <button
            type="submit"
            disabled={addConfig.isPending}
            className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-gray-900 dark:text-white transition-colors"
          >
            {addConfig.isPending ? t.common.saving : t.common.create}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── DDNSCard ─────────────────────────────────────────────────────────────────

export function DDNSCard() {
  const { data: configs, isLoading, isError } = useDdnsConfigs()
  const removeConfig = useRemoveDdnsConfig()
  const updateNow = useUpdateDdnsNow()
  const [showAddForm, setShowAddForm] = useState(false)
  const t = useT()

  return (
    <div className="rounded-xl bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
          <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-semibold uppercase tracking-wider">{t.network.ddnsTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateNow.mutate()}
            disabled={updateNow.isPending || !configs?.some((c) => c.enabled)}
            title={t.network.updateAllDdns}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', updateNow.isPending && 'animate-spin')} />
            {updateNow.isPending ? t.common.applying : t.common.update}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-black/5 dark:bg-white/5 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white hover:bg-black/10 dark:bg-white/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t.common.create}
          </button>
        </div>
      </div>

      {/* Update result feedback */}
      {updateNow.isSuccess && updateNow.data && (
        <div className="mb-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-700 dark:text-green-400">
          Updated — current IP: <span className="font-mono font-medium">{updateNow.data.ip}</span>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="mb-4">
          <AddForm onClose={() => setShowAddForm(false)} />
        </div>
      )}

      {/* Config list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-14 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>{t.network.failedToLoad}</span>
        </div>
      ) : !configs || configs.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-white/30 italic">{t.network.noDdns}</p>
      ) : (
        <div className="space-y-2">
          {configs.map((config) => {
            const providerLabel = PROVIDERS.find((p) => p.value === config.provider)?.label ?? config.provider
            return (
              <div
                key={config.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-lg border transition-colors',
                  config.enabled
                    ? 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5'
                    : 'border-black/5 dark:border-white/5 bg-transparent opacity-60',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-medium">
                      {providerLabel}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-white font-mono truncate">{config.domain}</span>
                    <StatusBadge status={config.lastStatus} />
                    {!config.enabled && (
                      <span className="text-xs text-gray-400 dark:text-white/30 italic">disabled</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-white/40">
                    {config.lastIp && (
                      <span className="font-mono">{config.lastIp}</span>
                    )}
                    <span>{formatRelativeTime(config.lastUpdate)}</span>
                  </div>
                </div>

                <button
                  onClick={() => removeConfig.mutate(config.id)}
                  disabled={removeConfig.isPending}
                  className="p-1.5 rounded-lg text-gray-400 dark:text-white/30 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
