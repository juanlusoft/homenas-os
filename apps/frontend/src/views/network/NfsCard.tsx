import { Share2 } from 'lucide-react'
import { useNfsStatus } from '../../hooks/useNetwork'
import type { NfsExport } from '@homenas/shared'

function NfsRow({ export_: exp }: { export_: NfsExport }) {
  return (
    <tr className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:bg-white/5 transition-colors">
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-indigo-700 dark:text-indigo-300">{exp.path}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-gray-700 dark:text-white/70">{exp.clients}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-gray-500 dark:text-white/50 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">{exp.options}</span>
      </td>
    </tr>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-black/5 dark:border-white/5">
      {Array.from({ length: 3 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-black/10 dark:bg-white/10 rounded animate-pulse" style={{ width: `${50 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

function ConnectedClientsBadge({ clients }: { clients: string[] }) {
  const hasClients = clients.length > 0
  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
          hasClients
            ? 'bg-green-500/20 text-green-700 dark:text-green-400'
            : 'bg-red-500/20 text-red-600 dark:text-red-400'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            hasClients ? 'bg-green-400 animate-pulse' : 'bg-red-400'
          }`}
        />
        {hasClients ? `${clients.length} connected` : 'no clients'}
      </span>
      {hasClients && (
        <div className="flex flex-col items-end gap-0.5 mt-0.5">
          {clients.map((ip) => (
            <span key={ip} className="text-xs font-mono text-gray-500 dark:text-white/50">
              {ip}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function NfsCard() {
  const { data: status, isLoading, error } = useNfsStatus()
  const exports_ = status?.exports
  const connectedClients = status?.connectedClients ?? []

  return (
    <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3">
        <Share2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h2 className="font-semibold text-gray-900 dark:text-white">NFS Exports</h2>
        <div className="ml-auto flex items-start gap-3">
          {exports_ && (
            <span className="text-xs text-gray-500 dark:text-white/40 pt-0.5">
              {exports_.length} export{exports_.length !== 1 ? 's' : ''}
            </span>
          )}
          {!isLoading && (
            <ConnectedClientsBadge clients={connectedClients} />
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-medium">Path</th>
              <th className="px-4 py-3 text-left font-medium">Clients</th>
              <th className="px-4 py-3 text-left font-medium">Options</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)}
            {error && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-red-600 dark:text-red-400 text-sm">
                  Error loading NFS exports
                </td>
              </tr>
            )}
            {exports_ && exports_.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400 dark:text-white/30 text-sm">
                  No NFS exports configured
                </td>
              </tr>
            )}
            {exports_?.map((exp, idx) => (
              <NfsRow key={`${exp.path}-${idx}`} export_={exp} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
