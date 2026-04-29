import { useState } from 'react'
import { ClipboardList, ChevronDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { systemApi } from '../../api/system'
import type { AuditEntry } from '../../api/system'
import { useT } from '../../i18n/useT'

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 p-5">
      {children}
    </div>
  )
}

const ACTION_BADGE: Record<string, string> = {
  login:                  'bg-green-500/10 text-green-700 dark:text-green-400',
  logout:                 'bg-gray-500/10 text-gray-500 dark:text-gray-400',
  reboot:                 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  ssh_enabled:            'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  ssh_disabled:           'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  create_user:            'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  delete_user:            'bg-red-500/10 text-red-600 dark:text-red-400',
  change_password_self:   'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  admin_change_password:  'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  totp_enabled:           'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  totp_disabled:          'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  setup_complete:         'bg-teal-500/10 text-teal-700 dark:text-teal-400',
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const PAGE_SIZE = 50

export function AuditLogCard() {
  const t = useT()
  const [offset, setOffset] = useState(0)
  const [allEntries, setAllEntries] = useState<AuditEntry[]>([])

  const query = useQuery({
    queryKey: ['audit-log', offset],
    queryFn: () => systemApi.auditLog(PAGE_SIZE, offset),
    staleTime: 30_000,
  })

  // Accumulate pages as user loads more
  const currentItems = query.data?.items ?? []
  const displayed = offset === 0 ? currentItems : [...allEntries, ...currentItems.filter(e => !allEntries.find(x => x.id === e.id))]
  const total = query.data?.total ?? 0
  const hasMore = displayed.length < total

  const loadMore = () => {
    setAllEntries(displayed)
    setOffset(prev => prev + PAGE_SIZE)
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
          <ClipboardList className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-semibold uppercase tracking-wider">{t.system.auditLog}</span>
        </div>
        {total > 0 && (
          <span className="text-xs text-gray-400 dark:text-white/30 font-mono">{total}</span>
        )}
      </div>

      {query.isPending && offset === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse h-10 bg-black/10 dark:bg-white/10 rounded-lg" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-white/30 italic">{t.system.noAuditEntries}</p>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
          {displayed.map(entry => (
            <div
              key={entry.id}
              className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${ACTION_BADGE[entry.action] ?? 'bg-gray-500/10 text-gray-500 dark:text-gray-400'}`}>
                  {entry.action.replace(/_/g, ' ')}
                </span>
                <span className="text-xs text-gray-600 dark:text-white/60 font-mono truncate">{entry.username}</span>
                {entry.detail && (
                  <span className="text-xs text-gray-400 dark:text-white/30 truncate hidden sm:block">{entry.detail}</span>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 dark:text-white/30 font-mono">{formatTime(entry.created_at)}</p>
                <p className="text-xs text-gray-300 dark:text-white/20 font-mono">{entry.ip}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={query.isFetching}
          className="mt-3 w-full flex items-center justify-center gap-1 py-1.5 text-xs text-gray-500 dark:text-white/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-50"
        >
          <ChevronDown className="w-3 h-3" />
          {query.isFetching ? t.common.loading : t.system.loadMore}
        </button>
      )}
    </Card>
  )
}
