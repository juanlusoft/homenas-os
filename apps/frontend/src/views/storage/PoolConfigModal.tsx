import { useState } from 'react'
import { X, Database, AlertTriangle, CheckCircle, XCircle, Loader2, Plus } from 'lucide-react'
import type { Disk } from '@homenas/shared'
import { storageApi } from '../../api/storage'
import { formatBytes } from '../../lib/utils'

interface PoolConfigModalProps {
  disks: Disk[]
  onClose: () => void
  onSuccess: () => void
}

type Action = 'add' | 'create'

type ModalStep =
  | { kind: 'select-action' }
  | { kind: 'confirm'; action: Action }
  | { kind: 'progress'; action: Action; current: number; total: number; results: DiskResult[] }
  | { kind: 'done'; results: DiskResult[] }

interface DiskResult {
  disk: string
  ok: boolean
  msg: string
}

export function PoolConfigModal({ disks, onClose, onSuccess }: PoolConfigModalProps) {
  const [step, setStep] = useState<ModalStep>({ kind: 'select-action' })

  async function runAdd() {
    setStep({ kind: 'progress', action: 'add', current: 0, total: disks.length, results: [] })
    try {
      const response = await storageApi.bulkAddToPool({ devices: disks.map(d => d.device) })
      const results: DiskResult[] = response.results.map(r => ({
        disk: r.device,
        ok: true,
        msg: r.poolUpdated ? `Añadido al pool → ${r.mountPoint}` : `Montado en ${r.mountPoint} (sin pool MergerFS activo)`,
      }))
      setStep({ kind: 'done', results })
      onSuccess()
    } catch (err) {
      const results: DiskResult[] = [{ disk: disks.map(d => d.device).join(', '), ok: false, msg: (err as Error).message }]
      setStep({ kind: 'done', results })
    }
  }

  async function runCreate() {
    setStep({ kind: 'progress', action: 'create', current: 0, total: 1, results: [] })
    try {
      const r = await storageApi.createPool({ devices: disks.map(d => d.device) })
      setStep({
        kind: 'done',
        results: [{ disk: disks.map(d => d.device).join(', '), ok: true, msg: `Pool creada en ${r.poolMount} con ${r.drives.length} disco(s)` }],
      })
      onSuccess()
    } catch (err) {
      setStep({
        kind: 'done',
        results: [{ disk: disks.map(d => d.device).join(', '), ok: false, msg: (err as Error).message }],
      })
    }
  }

  function handleConfirm(action: Action) {
    if (action === 'add') void runAdd()
    else void runCreate()
  }

  const isProcessing = step.kind === 'progress'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Configurar {disks.length} disco{disks.length !== 1 ? 's' : ''}
            </h2>
          </div>
          {!isProcessing && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {/* Disk list */}
          {step.kind !== 'done' && (
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-white/40 font-medium mb-2">
                Discos seleccionados
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {disks.map(disk => (
                  <div key={disk.device} className="flex items-center gap-3 bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2">
                    <span className="font-mono text-xs text-indigo-700 dark:text-indigo-300 shrink-0">{disk.device}</span>
                    <span className="text-xs text-gray-500 dark:text-white/40 tabular-nums shrink-0">{formatBytes(disk.sizeBytes)}</span>
                    {disk.model && (
                      <span className="text-xs text-gray-400 dark:text-white/30 truncate">{disk.model}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Select action */}
          {step.kind === 'select-action' && (
            <div className="space-y-2 border-t border-black/10 dark:border-white/10 pt-2">
              <button
                onClick={() => setStep({ kind: 'confirm', action: 'add' })}
                className="w-full px-4 py-3 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors text-left flex items-center gap-3"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <div>
                  <div>Añadir al pool existente</div>
                  <div className="text-xs font-normal opacity-80 mt-0.5">Formatea como ext4 y añade al MergerFS actual</div>
                </div>
              </button>
              <button
                onClick={() => setStep({ kind: 'confirm', action: 'create' })}
                className="w-full px-4 py-3 rounded-lg text-sm font-medium bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-white/70 transition-colors text-left flex items-center gap-3"
              >
                <Database className="w-4 h-4 shrink-0" />
                <div>
                  <div>Crear nueva pool MergerFS</div>
                  <div className="text-xs font-normal opacity-60 mt-0.5">Crea un nuevo punto de montaje con estos discos</div>
                </div>
              </button>
              <button
                onClick={onClose}
                className="w-full px-4 py-2 text-sm text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Confirm */}
          {step.kind === 'confirm' && (
            <div className="space-y-4 border-t border-black/10 dark:border-white/10 pt-2">
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl p-4">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Operación destructiva</p>
                  <p className="text-sm text-red-600 dark:text-red-300">
                    Se FORMATEARAN {disks.length > 1 ? `los ${disks.length} discos` : disk_label(disks)} (
                    <span className="font-mono">{disks.map(d => d.device).join(', ')}</span>).
                    Todos los datos actuales se perderán. Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep({ kind: 'select-action' })}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 transition-colors"
                >
                  Atrás
                </button>
                <button
                  onClick={() => handleConfirm(step.action)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Confirmar y formatear
                </button>
              </div>
            </div>
          )}

          {/* Progress */}
          {step.kind === 'progress' && (
            <div className="border-t border-black/10 dark:border-white/10 pt-2 space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="text-sm text-gray-600 dark:text-white/60">
                  {step.action === 'create'
                    ? 'Creando pool MergerFS...'
                    : `Procesando disco ${step.current} de ${step.total}...`}
                </span>
              </div>
              {step.results.length > 0 && (
                <div className="space-y-1.5">
                  {step.results.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      {r.ok
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                        : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />}
                      <span className="font-mono text-indigo-700 dark:text-indigo-300 shrink-0">{r.disk}</span>
                      <span className="text-gray-500 dark:text-white/40">{r.msg}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Done */}
          {step.kind === 'done' && (
            <div className="space-y-3">
              {step.results.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 rounded-xl p-3 ${
                    r.ok
                      ? 'bg-green-500/10 border border-green-500/25'
                      : 'bg-red-500/10 border border-red-500/25'
                  }`}
                >
                  {r.ok
                    ? <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-indigo-700 dark:text-indigo-300">{r.disk}</span>
                    <p className={`text-xs mt-0.5 break-all ${r.ok ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`}>
                      {r.msg}
                    </p>
                  </div>
                </div>
              ))}
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function disk_label(disks: Disk[]) {
  return disks.length === 1 ? `el disco ${disks[0].device}` : `los ${disks.length} discos`
}
