import { Network, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { useNetworkInterfaces } from '../../hooks/useNetwork'
import { formatBytes } from '../../lib/utils'
import type { NetworkInterface } from '@homenas/shared'

function UpBadge({ isUp }: { isUp: boolean }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
      isUp ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'
    }`}>
      {isUp ? 'UP' : 'DOWN'}
    </span>
  )
}

function InterfaceRow({ iface }: { iface: NetworkInterface }) {
  return (
    <tr className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:bg-white/5 transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-sm text-indigo-700 dark:text-indigo-300">{iface.name}</span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-white/70 font-mono">
        {iface.ipv4 ?? <span className="text-gray-400 dark:text-white/30">—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-white/50 font-mono">
        {iface.ipv6 ?? <span className="text-gray-400 dark:text-white/30">—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-white/50 font-mono">
        {iface.mac ?? <span className="text-gray-400 dark:text-white/30">—</span>}
      </td>
      <td className="px-4 py-3">
        <UpBadge isUp={iface.isUp} />
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-white/50 font-mono">
        {iface.speed ?? <span className="text-gray-400 dark:text-white/30">—</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-white/50">
          <ArrowDownCircle className="w-3.5 h-3.5 text-green-700 dark:text-green-400" />
          <span className="tabular-nums">{formatBytes(iface.rxBytes)}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-white/50">
          <ArrowUpCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span className="tabular-nums">{formatBytes(iface.txBytes)}</span>
        </div>
      </td>
    </tr>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-black/5 dark:border-white/5">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-black/10 dark:bg-white/10 rounded animate-pulse" style={{ width: `${50 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

export function InterfacesCard() {
  const { data: interfaces, isLoading, error } = useNetworkInterfaces()

  return (
    <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3">
        <Network className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h2 className="font-semibold text-gray-900 dark:text-white">Network Interfaces</h2>
        {interfaces && (
          <span className="ml-auto text-xs text-gray-500 dark:text-white/40">
            {interfaces.length} interface{interfaces.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-medium">Interface</th>
              <th className="px-4 py-3 text-left font-medium">IPv4</th>
              <th className="px-4 py-3 text-left font-medium">IPv6</th>
              <th className="px-4 py-3 text-left font-medium">MAC</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Speed</th>
              <th className="px-4 py-3 text-left font-medium">RX</th>
              <th className="px-4 py-3 text-left font-medium">TX</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
            {error && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-red-600 dark:text-red-400 text-sm">
                  Error loading network interfaces
                </td>
              </tr>
            )}
            {interfaces && interfaces.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-400 dark:text-white/30 text-sm">
                  No interfaces found
                </td>
              </tr>
            )}
            {interfaces?.map((iface) => (
              <InterfaceRow key={iface.name} iface={iface} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
