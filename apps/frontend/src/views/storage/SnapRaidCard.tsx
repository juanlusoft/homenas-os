import { useState } from 'react'
import { Play, StopCircle, CalendarClock, CheckCircle2 } from 'lucide-react'
import { useSnapRaidStatus, useStartSnapRaid, useStopSnapRaid, useMergerFSStatus } from '../../hooks/useStorage'
import { useCreateTask } from '../../hooks/useScheduler'
import type { SnapRaidStatus } from '@homenas/shared'
import { useT } from '../../i18n/useT'

function StatusBadge({ status }: { status: SnapRaidStatus }) {
  if (!status.running) {
    if (!status.configured) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-black/10 dark:bg-white/10 text-gray-500 dark:text-white/50 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
          NO CONFIGURADO
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-500/20 text-green-700 dark:text-green-400 px-2.5 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        LISTO
      </span>
    )
  }

  const colors: Record<string, string> = {
    sync: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
    scrub: 'bg-violet-500/20 text-violet-300',
    fix: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
    check: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300',
  }

  const color = colors[status.operation] ?? 'bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/60'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${color}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {status.operation.toUpperCase()}
    </span>
  )
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500 dark:text-white/40">
        <span>Progreso</span>
        <span className="tabular-nums">{progress.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

function formatTimestamp(ts: number | null): string {
  if (ts === null) return '—'
  return new Date(ts * 1000).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type Operation = 'sync' | 'scrub' | 'fix' | 'check'

export function SnapRaidCard() {
  const { data: status, isLoading } = useSnapRaidStatus()
  const { data: mergerfs } = useMergerFSStatus()
  const startMutation = useStartSnapRaid()
  const stopMutation = useStopSnapRaid()
  const createTask = useCreateTask()
  const [confirmOp, setConfirmOp] = useState<Operation | null>(null)
  const [cronCreated, setCronCreated] = useState(false)
  const t = useT()

  const running = status?.running ?? false

  // Detect cache and data disk paths from live MergerFS status
  const cacheDisk = mergerfs?.drives.find(d => d.role === 'cache')?.path ?? null
  const dataDisk  = mergerfs?.drives.find(d => d.role === 'data')?.path  ?? null

  async function handleCreateCrons() {
    // Order matters:
    // 1. 05:00 — drain cache (fast disk → data disk) so all files are on data disks
    // 2. 06:00 — snapraid sync (parity calculated after cache is empty)
    // 3. 07:00 — snapraid scrub on Sundays (integrity check after sync)
    const tasks = [
      createTask.mutateAsync({
        name: 'SnapRAID Sync',
        description: 'Calcula la paridad con los datos ya en el HDD (corre después del vaciado de caché)',
        cronExpression: '0 6 * * *',
        command: 'snapraid',
        args: ['sync'],
        enabled: true,
      }),
      createTask.mutateAsync({
        name: 'SnapRAID Scrub',
        description: 'Verifica la integridad de datos cada domingo (corre después del sync)',
        cronExpression: '0 7 * * 0',
        command: 'snapraid',
        args: ['scrub'],
        enabled: true,
      }),
    ]

    if (cacheDisk && dataDisk) {
      tasks.push(createTask.mutateAsync({
        name: 'Vaciar caché MergerFS',
        description: `Mueve archivos de ${cacheDisk} a ${dataDisk} (debe correr ANTES del sync)`,
        cronExpression: '0 5 * * *',
        command: 'rsync',
        args: ['--remove-source-files', '--archive', `${cacheDisk}/`, `${dataDisk}/`],
        enabled: true,
      }))
    }

    await Promise.all(tasks)
    setCronCreated(true)
  }

  function handleStart(op: Operation) {
    if (op === 'fix') {
      setConfirmOp(op)
      return
    }
    startMutation.mutate({ operation: op })
  }

  function handleConfirm() {
    if (confirmOp) {
      startMutation.mutate({ operation: confirmOp })
      setConfirmOp(null)
    }
  }

  return (
    <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl shadow-lg p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582 4-8 4m0 5c0 2.21 3.582 4 8 4s8-1.79 8-4" />
          </svg>
          <h2 className="font-semibold text-gray-900 dark:text-white">{t.storage.snapraid}</h2>
        </div>
        {status && <StatusBadge status={status} />}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 bg-black/10 dark:bg-white/10 rounded animate-pulse" />
          ))}
        </div>
      )}

      {status && (
        <>
          {/* Progress bar — only when running */}
          {status.running && <ProgressBar progress={status.progress} />}

          {/* Status text */}
          {status.status && (
            <p className="text-xs text-gray-500 dark:text-white/50 font-mono bg-black/5 dark:bg-white/5 rounded px-3 py-2 truncate">
              {status.status === 'Inactivo' && status.configured ? t.storage.syncHint : status.status}
            </p>
          )}

          {/* Error */}
          {status.error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {status.error}
            </p>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2">
              <p className="text-gray-500 dark:text-white/40 mb-1">{t.storage.lastSync}</p>
              <p className="text-gray-700 dark:text-white/70 font-mono">{formatTimestamp(status.lastSync)}</p>
            </div>
            <div className="bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2">
              <p className="text-gray-500 dark:text-white/40 mb-1">{t.storage.lastScrub}</p>
              <p className="text-gray-700 dark:text-white/70 font-mono">{formatTimestamp(status.lastScrub)}</p>
            </div>
          </div>

          {/* Auto-cron setup */}
          {status.configured && !running && (
            <div className="border-t border-black/5 dark:border-white/5 pt-3">
              {cronCreated ? (
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Tareas creadas en el Scheduler (caché 5:00 → sync 6:00 → scrub domingos 7:00)
                </div>
              ) : (
                <button
                  onClick={() => void handleCreateCrons()}
                  disabled={createTask.isPending}
                  className="flex items-center gap-1.5 text-xs font-medium bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 w-full justify-center"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  {createTask.isPending ? 'Creando tareas...' : 'Crear tareas automáticas (sync + scrub + caché)'}
                </button>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            {running ? (
              <button
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                className="flex items-center gap-1.5 text-xs font-medium bg-red-500/20 hover:bg-red-500/30 text-red-700 dark:text-red-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <StopCircle className="w-3.5 h-3.5" />
                Detener
              </button>
            ) : (
              <>
                {(['sync', 'scrub', 'check'] as const).map((op) => (
                  <button
                    key={op}
                    onClick={() => handleStart(op)}
                    disabled={running || startMutation.isPending}
                    className="flex items-center gap-1.5 text-xs font-medium bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 capitalize"
                  >
                    <Play className="w-3 h-3" />
                    {op}
                  </button>
                ))}
                <button
                  onClick={() => handleStart('fix')}
                  disabled={running || startMutation.isPending}
                  className="flex items-center gap-1.5 text-xs font-medium bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-700 dark:text-yellow-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  Fix
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Confirmation dialog for "fix" */}
      {confirmOp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-gray-900 dark:text-white font-semibold">Confirmar operación peligrosa</h3>
            <p className="text-gray-600 dark:text-white/60 text-sm">
              <span className="font-mono text-yellow-700 dark:text-yellow-300">snapraid fix</span> puede sobrescribir datos.
              Asegúrate de que el sync está actualizado antes de continuar.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmOp(null)}
                className="text-sm text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-lg hover:bg-black/10 dark:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                className="text-sm font-medium bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-700 dark:text-yellow-300 px-4 py-2 rounded-lg transition-colors"
              >
                Ejecutar Fix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
