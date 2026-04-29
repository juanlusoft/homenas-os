import { useState } from 'react'
import { Globe, Plus, Plug, PlugZap, Trash2, CheckCircle, Circle } from 'lucide-react'
import { useNetworkDrives, useMountDrive, useUnmountDrive, useDeleteDrive } from '../../hooks/useNetworkDrives'
import type { NetworkDrive } from '../../api/network-drives'
import { AddDriveModal } from './AddDriveModal'
import { useT } from '../../i18n/useT'

const TYPE_LABELS: Record<string, string> = {
  webdav: 'WebDAV',
  sftp:   'SFTP',
  s3:     'S3',
  smb:    'SMB',
  ftp:    'FTP',
  b2:     'Backblaze B2',
}

function DriveCard({ drive }: { drive: NetworkDrive }) {
  const t = useT()
  const mount   = useMountDrive()
  const unmount = useUnmountDrive()
  const del     = useDeleteDrive()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isMounted = Boolean(drive.is_mounted)
  const isLoading = mount.isPending || unmount.isPending

  const handleToggle = () => {
    if (isMounted) {
      unmount.mutate(drive.id)
    } else {
      mount.mutate(drive.id)
    }
  }

  return (
    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4 flex items-center gap-4">
      {/* Icon */}
      <div className={`p-2.5 rounded-lg shrink-0 ${isMounted ? 'bg-green-500/10' : 'bg-black/5 dark:bg-white/5'}`}>
        <Globe className={`w-5 h-5 ${isMounted ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-white/30'}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 dark:text-white">{drive.name}</span>
          <span className="text-xs bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/60 px-2 py-0.5 rounded font-mono shrink-0">
            {TYPE_LABELS[drive.type] ?? drive.type}
          </span>
          {isMounted ? (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 shrink-0">
              <CheckCircle className="w-3 h-3" />
              {t.networkDrives.mounted}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-white/30 shrink-0">
              <Circle className="w-3 h-3" />
              {t.networkDrives.unmounted}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-white/30 font-mono mt-0.5 truncate">{drive.mount_point}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleToggle}
          disabled={isLoading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
            isMounted
              ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20'
              : 'bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20'
          }`}
        >
          {isLoading ? (
            <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          ) : isMounted ? (
            <Plug className="w-3 h-3" />
          ) : (
            <PlugZap className="w-3 h-3" />
          )}
          {isMounted ? t.networkDrives.unmount : t.networkDrives.mount}
        </button>

        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => del.mutate(drive.id)}
              disabled={del.isPending}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
            >
              {t.common.yes}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-black/5 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            >
              {t.common.no}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            title={t.networkDrives.delete}
            className="p-1.5 rounded-lg text-gray-400 dark:text-white/30 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

export function NetworkDrivesView() {
  const t = useT()
  const { data: drives, isLoading, error } = useNetworkDrives()
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.networkDrives.title}</h1>
          <p className="text-sm text-gray-500 dark:text-white/40 mt-0.5">{t.networkDrives.subtitle}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t.networkDrives.addDrive}
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl px-4 py-3 text-xs text-indigo-700 dark:text-indigo-300">
        {t.networkDrives.infoBanner}
      </div>

      {/* Drive list */}
      <div className="space-y-3">
        {isLoading && (
          <>
            <div className="h-20 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl animate-pulse" />
            <div className="h-20 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl animate-pulse" />
          </>
        )}

        {error && (
          <div className="text-center py-8 text-red-600 dark:text-red-400 text-sm">
            {t.networkDrives.failedToLoad}
          </div>
        )}

        {!isLoading && !error && drives?.length === 0 && (
          <div className="text-center py-16 text-gray-400 dark:text-white/30">
            <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t.networkDrives.noDrives}</p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {t.networkDrives.addDrive}
            </button>
          </div>
        )}

        {drives?.map(drive => (
          <DriveCard key={drive.id} drive={drive} />
        ))}
      </div>

      {showAdd && <AddDriveModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}
