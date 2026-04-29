import { useState } from 'react'
import { Terminal, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { useSshStatus, useEnableSsh, useDisableSsh } from '../../hooks/useSystem'

export function SshToggleCard() {
  const { data, isLoading } = useSshStatus()
  const enable  = useEnableSsh()
  const disable = useDisableSsh()
  const [confirm, setConfirm] = useState(false)

  const active  = data?.active ?? false
  const pending = enable.isPending || disable.isPending

  function handleToggle() {
    if (!confirm) { setConfirm(true); return }
    const mutation = active ? disable : enable
    mutation.mutate(undefined, { onSettled: () => setConfirm(false) })
  }

  return (
    <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl shadow-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <Terminal className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">Acceso SSH</h2>
          <p className="text-sm text-gray-500 dark:text-white/40">Activa o desactiva el servidor SSH del NAS.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : (
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
              active
                ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                : 'bg-black/10 dark:bg-white/10 text-gray-500 dark:text-white/40'
            }`}>
              {active ? 'Activo' : 'Inactivo'}
            </span>
          )}
        </div>
      </div>

      {confirm && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {active
              ? 'Si desactivas SSH perderás el acceso remoto por terminal. ¿Seguro?'
              : '¿Activar el acceso SSH al NAS?'}
          </span>
        </div>
      )}

      {(enable.isSuccess || disable.isSuccess) && !confirm && (
        <div className="mb-4 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle className="w-4 h-4" />
          {active ? 'SSH activado' : 'SSH desactivado'}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleToggle}
          disabled={pending || isLoading}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
            confirm
              ? 'bg-amber-600 hover:bg-amber-500 text-white'
              : active
                ? 'border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {pending
            ? (active ? 'Desactivando…' : 'Activando…')
            : confirm
              ? 'Confirmar'
              : active
                ? 'Desactivar SSH'
                : 'Activar SSH'}
        </button>

        {confirm && (
          <button
            onClick={() => setConfirm(false)}
            className="px-3 py-2 text-sm text-gray-500 dark:text-white/40 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}
