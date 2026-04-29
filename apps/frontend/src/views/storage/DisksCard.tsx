import { useState } from 'react'
import { CheckCircle, XCircle, Minus, Thermometer, Wrench } from 'lucide-react'
import { useDisks, useIoStats } from '../../hooks/useStorage'
import { formatBytes } from '../../lib/utils'
import type { Disk } from '@homenas/shared'
import type { DiskIoStat } from '../../api/storage'
import { useT } from '../../i18n/useT'
import { DiskManageModal } from './DiskManageModal'

function SmartHealthIcon({ smart }: { smart: Disk['smart'] }) {
  if (smart === null) {
    return <Minus className="w-4 h-4 text-gray-400 dark:text-white/30" />
  }
  if (smart.healthy) {
    return <CheckCircle className="w-4 h-4 text-green-700 dark:text-green-400" />
  }
  return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
}

function UsageBar({ sizeBytes, usedBytes }: { sizeBytes: number; usedBytes: number | null }) {
  if (usedBytes === null || sizeBytes === 0) return <span className="text-gray-400 dark:text-white/30 text-xs">—</span>
  const pct = Math.min(100, (usedBytes / sizeBytes) * 100)
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-indigo-500'
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 dark:text-white/50 tabular-nums w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

function IoCell({ value, color }: { value: number; color: string }) {
  const label = value < 0.1 ? '—' : value < 1 ? `${(value * 1024).toFixed(0)} KB/s` : `${value.toFixed(1)} MB/s`
  return (
    <span className={`text-xs font-mono tabular-nums ${value < 0.1 ? 'text-gray-400 dark:text-white/25' : color}`}>
      {label}
    </span>
  )
}

function DiskRow({
  disk,
  io,
  onManage,
}: {
  disk: Disk
  io: DiskIoStat | undefined
  onManage: (disk: Disk) => void
}) {
  const isUnconfigured = disk.mountPoint === null && disk.fsType === null
  return (
    <tr className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:bg-white/5 transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-indigo-700 dark:text-indigo-300">{disk.device}</span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-white/70">
        {disk.model ?? <span className="text-gray-400 dark:text-white/30">—</span>}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-white/70 tabular-nums">
        {formatBytes(disk.sizeBytes)}
      </td>
      <td className="px-4 py-3">
        <UsageBar sizeBytes={disk.sizeBytes} usedBytes={disk.usedBytes} />
      </td>
      <td className="px-4 py-3">
        {disk.fsType
          ? <span className="text-xs bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/60 px-2 py-0.5 rounded font-mono">{disk.fsType}</span>
          : <span className="text-gray-400 dark:text-white/30 text-xs">—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-white/50 font-mono">
        {disk.mountPoint ?? <span className="text-gray-400 dark:text-white/30">—</span>}
      </td>
      <td className="px-4 py-3">
        <IoCell value={io?.readMBs ?? 0} color="text-green-600 dark:text-green-400" />
      </td>
      <td className="px-4 py-3">
        <IoCell value={io?.writeMBs ?? 0} color="text-yellow-600 dark:text-yellow-400" />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <SmartHealthIcon smart={disk.smart} />
          {disk.smart?.temperature != null && (
            <span className="flex items-center gap-1 text-xs bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/60 px-1.5 py-0.5 rounded">
              <Thermometer className="w-3 h-3" />
              {disk.smart.temperature}°C
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {isUnconfigured && (
          <button
            onClick={() => onManage(disk)}
            title="Gestionar disco"
            className="p-1.5 rounded-lg text-gray-400 dark:text-white/30 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
          >
            <Wrench className="w-4 h-4" />
          </button>
        )}
      </td>
    </tr>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-black/5 dark:border-white/5">
      {Array.from({ length: 10 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-black/10 dark:bg-white/10 rounded animate-pulse" style={{ width: `${60 + (i * 13) % 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

export function DisksCard() {
  const { data: disks, isLoading, error, refetch } = useDisks()
  const t = useT()
  const [managingDisk, setManagingDisk] = useState<Disk | null>(null)

  // Derive disk IDs (e.g. /dev/sda → sda) for I/O stats
  const diskIds = disks?.map(d => d.name).filter(Boolean) ?? []
  const { data: ioData } = useIoStats(diskIds)
  const ioMap = new Map<string, DiskIoStat>((ioData?.disks ?? []).map(d => [d.diskId, d]))

  return (
    <>
      <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3">
          <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
          </svg>
          <h2 className="font-semibold text-gray-900 dark:text-white">{t.storage.disks}</h2>
          {disks && (
            <span className="ml-auto text-xs text-gray-500 dark:text-white/40">{t.storage.disksCount(disks.length)}</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left font-medium">{t.storage.device}</th>
                <th className="px-4 py-3 text-left font-medium">{t.storage.model}</th>
                <th className="px-4 py-3 text-left font-medium">{t.storage.size}</th>
                <th className="px-4 py-3 text-left font-medium">{t.storage.used}</th>
                <th className="px-4 py-3 text-left font-medium">FS</th>
                <th className="px-4 py-3 text-left font-medium">{t.storage.mountPoint}</th>
                <th className="px-4 py-3 text-left font-medium text-green-600 dark:text-green-500">↑ Read</th>
                <th className="px-4 py-3 text-left font-medium text-yellow-600 dark:text-yellow-500">↓ Write</th>
                <th className="px-4 py-3 text-left font-medium">SMART</th>
                <th className="px-4 py-3 text-left font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
              {error && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-red-600 dark:text-red-400 text-sm">
                    {t.storage.failedToLoad}
                  </td>
                </tr>
              )}
              {disks && disks.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-gray-400 dark:text-white/30 text-sm">
                    {t.storage.noDisks}
                  </td>
                </tr>
              )}
              {disks?.map((disk) => (
                <DiskRow
                  key={disk.device}
                  disk={disk}
                  io={ioMap.get(disk.name)}
                  onManage={setManagingDisk}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {managingDisk && (
        <DiskManageModal
          disk={managingDisk}
          onClose={() => setManagingDisk(null)}
          onSuccess={() => { void refetch() }}
        />
      )}
    </>
  )
}
