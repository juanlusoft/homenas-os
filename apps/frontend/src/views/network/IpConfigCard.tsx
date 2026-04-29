import { useState } from 'react'
import { Settings, Wifi, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useIpConfig, useSetIpConfig } from '../../hooks/useNetwork'

interface IpFormState {
  mode: 'dhcp' | 'static'
  ip: string
  prefix: string
  gateway: string
  dns: string
}

function IpConfigRow({ iface }: { iface: { name: string; ip: string | null; isDhcp: boolean } }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<IpFormState>({
    mode:    iface.isDhcp ? 'dhcp' : 'static',
    ip:      iface.ip ?? '',
    prefix:  '24',
    gateway: iface.ip ? iface.ip.replace(/\.\d+$/, '.1') : '',
    dns:     '8.8.8.8',
  })
  const [warn, setWarn] = useState(false)
  const [done, setDone] = useState(false)

  const set = useMutation_setIpConfig()

  function handleSubmit() {
    if (!warn) { setWarn(true); return }
    set.mutate(
      form.mode === 'dhcp'
        ? { interface: iface.name, mode: 'dhcp' }
        : {
            interface: iface.name,
            mode:      'static',
            ip:        form.ip,
            prefix:    parseInt(form.prefix, 10),
            gateway:   form.gateway,
            dns:       form.dns || undefined,
          },
      {
        onSuccess: () => { setDone(true); setWarn(false); setOpen(false) },
        onError:   () => { setWarn(false) },
      }
    )
  }

  const inputCls = 'w-full px-2.5 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-colors'

  return (
    <>
      <tr className="border-b border-black/5 dark:border-white/5">
        <td className="px-4 py-3 font-mono text-sm text-indigo-700 dark:text-indigo-300">{iface.name}</td>
        <td className="px-4 py-3 font-mono text-sm text-gray-700 dark:text-white/70">
          {iface.ip ?? <span className="text-gray-400 dark:text-white/30">—</span>}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            iface.isDhcp
              ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
              : 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
          }`}>
            {iface.isDhcp ? 'DHCP' : 'Static'}
          </span>
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => { setOpen(!open); setWarn(false); setDone(false) }}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-white/60 border border-black/10 dark:border-white/10 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurar
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </td>
      </tr>

      {open && (
        <tr className="border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
          <td colSpan={4} className="px-4 py-4">
            <div className="max-w-lg space-y-3">
              {/* Mode toggle */}
              <div className="flex gap-2">
                {(['dhcp', 'static'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setForm((f) => ({ ...f, mode: m })); setWarn(false) }}
                    className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                      form.mode === m
                        ? 'bg-indigo-600 text-white'
                        : 'bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/60 hover:bg-black/15 dark:hover:bg-white/15'
                    }`}
                  >
                    {m === 'dhcp' ? 'DHCP automático' : 'IP estática'}
                  </button>
                ))}
              </div>

              {form.mode === 'static' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">IP</label>
                    <input type="text" value={form.ip} onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))} placeholder="192.168.1.100" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Prefijo (CIDR)</label>
                    <input type="number" min={1} max={32} value={form.prefix} onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))} placeholder="24" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Gateway</label>
                    <input type="text" value={form.gateway} onChange={(e) => setForm((f) => ({ ...f, gateway: e.target.value }))} placeholder="192.168.1.1" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">DNS (opcional)</label>
                    <input type="text" value={form.dns} onChange={(e) => setForm((f) => ({ ...f, dns: e.target.value }))} placeholder="8.8.8.8" className={inputCls} />
                  </div>
                </div>
              )}

              {warn && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Cambiar la IP puede interrumpir la conexión. Si usas IP estática asegúrate de apuntar a la nueva IP. ¿Continuar?</span>
                </div>
              )}

              {set.isError && (
                <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {set.error instanceof Error ? set.error.message : 'Error al aplicar configuración'}
                </p>
              )}

              {done && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Configuración aplicada
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={set.isPending}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {set.isPending ? 'Aplicando…' : warn ? 'Confirmar cambio' : 'Aplicar'}
                </button>
                <button
                  onClick={() => { setOpen(false); setWarn(false) }}
                  className="px-3 py-1.5 text-sm text-gray-500 dark:text-white/40 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// Hook alias to avoid lint issue with hook naming inside component
function useMutation_setIpConfig() { return useSetIpConfig() }

export function IpConfigCard() {
  const { data, isLoading, error } = useIpConfig()

  return (
    <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3">
        <Wifi className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h2 className="font-semibold text-gray-900 dark:text-white">Configuración IP</h2>
        <span className="ml-auto text-xs text-gray-500 dark:text-white/40">DHCP · Estática</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-medium">Interfaz</th>
              <th className="px-4 py-3 text-left font-medium">IP actual</th>
              <th className="px-4 py-3 text-left font-medium">Modo</th>
              <th className="px-4 py-3 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              Array.from({ length: 2 }).map((_, i) => (
                <tr key={i} className="border-b border-black/5 dark:border-white/5">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-black/10 dark:bg-white/10 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            )}
            {error && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-red-600 dark:text-red-400 text-sm">
                  Error al cargar la configuración de red
                </td>
              </tr>
            )}
            {data?.interfaces.map((iface) => (
              <IpConfigRow key={iface.name} iface={iface} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
