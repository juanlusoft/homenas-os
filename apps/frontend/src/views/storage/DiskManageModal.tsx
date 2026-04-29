import { useState, useEffect } from 'react'
import { X, Wrench, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { Disk, DiskPartition } from '@homenas/shared'
import { storageApi } from '../../api/storage'
import { formatBytes } from '../../lib/utils'

interface DiskManageModalProps {
  disk: Disk
  onClose: () => void
  onSuccess: () => void
}

type ModalStep =
  | { kind: 'loading' }
  | { kind: 'select'; partitions: DiskPartition[] }
  | { kind: 'confirm-add' }
  | { kind: 'confirm-create' }
  | { kind: 'progress'; message: string }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

function OsHintBadge({ hint }: { hint: DiskPartition['osHint'] }) {
  if (hint === 'windows') {
    return (
      <span className="text-xs bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-medium">
        Windows
      </span>
    )
  }
  if (hint === 'linux') {
    return (
      <span className="text-xs bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 rounded font-medium">
        Linux
      </span>
    )
  }
  return (
    <span className="text-xs bg-black/10 dark:bg-white/10 text-gray-500 dark:text-white/40 px-2 py-0.5 rounded font-medium">
      Sin formato
    </span>
  )
}

export function DiskManageModal({ disk, onClose, onSuccess }: DiskManageModalProps) {
  const [step, setStep] = useState<ModalStep>({ kind: 'loading' })

  const diskName = disk.name // e.g. "sdc"

  useEffect(() => {
    let cancelled = false
    storageApi.getDiskPartitions(diskName)
      .then(partitions => {
        if (!cancelled) setStep({ kind: 'select', partitions })
      })
      .catch(err => {
        if (!cancelled) {
          setStep({ kind: 'error', message: (err as Error).message })
        }
      })
    return () => { cancelled = true }
  }, [diskName])

  async function handleMount(partition: DiskPartition) {
    const browserId = `browse_${diskName}_${Date.now()}`
    setStep({ kind: 'progress', message: `Montando ${partition.partition} en modo lectura...` })
    try {
      const result = await storageApi.mountPartition(diskName, { browserId })
      setStep({ kind: 'success', message: `Disco montado en ${result.mountPoint} (solo lectura)` })
    } catch (err) {
      setStep({ kind: 'error', message: (err as Error).message })
    }
  }

  async function handleAddToPool() {
    setStep({ kind: 'progress', message: `Formateando /dev/${diskName} y añadiendo al pool...` })
    try {
      const result = await storageApi.addDiskToPool(diskName)
      const poolMsg = result.poolUpdated
        ? `Disco añadido al pool MergerFS y montado en ${result.mountPoint}`
        : `Disco formateado y montado en ${result.mountPoint}. No se encontró un pool MergerFS existente.`
      setStep({ kind: 'success', message: poolMsg })
      onSuccess()
    } catch (err) {
      setStep({ kind: 'error', message: (err as Error).message })
    }
  }

  async function handleCreatePool() {
    setStep({ kind: 'progress', message: `Formateando /dev/${diskName} y creando nueva pool MergerFS...` })
    try {
      const result = await storageApi.createPool({ devices: [disk.device] })
      setStep({
        kind: 'success',
        message: `Pool MergerFS creada en ${result.poolMount} con ${result.drives.length} disco(s).`,
      })
      onSuccess()
    } catch (err) {
      setStep({ kind: 'error', message: (err as Error).message })
    }
  }

  const hasReadablePartitions =
    step.kind === 'select' &&
    step.partitions.some(p => p.osHint === 'windows' || p.osHint === 'linux')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Gestionar disco
            </h2>
            <span className="font-mono text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded">
              {disk.device}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 hover:bg-black/5 dark:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Loading */}
          {step.kind === 'loading' && (
            <div className="flex items-center justify-center gap-3 py-8 text-gray-500 dark:text-white/40">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Escaneando particiones...</span>
            </div>
          )}

          {/* Select action */}
          {step.kind === 'select' && (
            <div className="space-y-4">
              {/* Partition list */}
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-white/40 font-medium mb-2">
                  Particiones detectadas
                </p>
                {step.partitions.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-white/30 italic">
                    Sin particiones detectadas en el disco.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {step.partitions.map(part => (
                      <div
                        key={part.partition}
                        className="flex items-center gap-3 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-lg px-3 py-2.5"
                      >
                        <span className="font-mono text-xs text-indigo-700 dark:text-indigo-300 flex-shrink-0">
                          {part.partition}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-white/40 tabular-nums">
                          {formatBytes(part.sizeBytes)}
                        </span>
                        {part.fsType && (
                          <span className="text-xs bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/60 px-1.5 py-0.5 rounded font-mono">
                            {part.fsType}
                          </span>
                        )}
                        <OsHintBadge hint={part.osHint} />
                        {(part.osHint === 'windows' || part.osHint === 'linux') && (
                          <button
                            onClick={() => handleMount(part)}
                            className="ml-auto text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0"
                          >
                            Montar (ro)
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="border-t border-black/10 dark:border-white/10 pt-4 space-y-2">
                {hasReadablePartitions && (
                  <p className="text-xs text-gray-500 dark:text-white/40 mb-3">
                    Usa "Montar (ro)" junto a cada particion para acceder a los datos en modo lectura.
                  </p>
                )}
                <button
                  onClick={() => setStep({ kind: 'confirm-add' })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  Añadir a pool existente
                </button>
                <button
                  onClick={() => setStep({ kind: 'confirm-create' })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 text-gray-700 dark:text-white/70 transition-colors"
                >
                  Crear nueva pool MergerFS
                </button>
                <button
                  onClick={onClose}
                  className="w-full px-4 py-2.5 rounded-lg text-sm text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Destructive confirmation — add to pool */}
          {step.kind === 'confirm-add' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl p-4">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">
                    Advertencia: operacion destructiva
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-300">
                    Esta operacion FORMATEARA <span className="font-mono font-bold">{disk.device}</span>.
                    Se perderan todos los datos actuales del disco. Esta accion no se puede deshacer.
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-white/60">
                El disco se formateara como ext4, se montara en <span className="font-mono text-xs">/mnt/disks/diskN</span> y se
                intentara anadir al pool MergerFS existente.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep({ kind: 'select', partitions: [] })}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/60 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddToPool}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Confirmar y formatear
                </button>
              </div>
            </div>
          )}

          {/* Destructive confirmation — create pool */}
          {step.kind === 'confirm-create' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl p-4">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">
                    Advertencia: operacion destructiva
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-300">
                    Esta operacion FORMATEARA <span className="font-mono font-bold">{disk.device}</span>.
                    Se perderan todos los datos actuales del disco. Esta accion no se puede deshacer.
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-white/60">
                El disco se formateara como ext4 y se creara una nueva pool MergerFS. Si ya existe
                una pool en <span className="font-mono text-xs">/mnt/pool</span>, se usara
                <span className="font-mono text-xs"> /mnt/pool2</span>, etc.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep({ kind: 'select', partitions: [] })}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/60 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreatePool}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Confirmar y formatear
                </button>
              </div>
            </div>
          )}

          {/* In progress */}
          {step.kind === 'progress' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
              <p className="text-sm text-gray-600 dark:text-white/60 text-center">{step.message}</p>
            </div>
          )}

          {/* Success */}
          {step.kind === 'success' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/25 rounded-xl p-4">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-700 dark:text-green-300">{step.message}</p>
              </div>
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Error */}
          {step.kind === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl p-4">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Error</p>
                  <p className="text-xs font-mono text-red-600 dark:text-red-300 break-all">{step.message}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/60 transition-colors"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => setStep({ kind: 'loading' })}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
