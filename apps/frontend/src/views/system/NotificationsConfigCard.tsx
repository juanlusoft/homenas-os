import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Mail, Send, Bell, CheckCircle, AlertTriangle } from 'lucide-react'
import { notificationsApi, type EmailConfig, type TelegramConfig } from '../../api/notifications'

// ─── Shared UI ────────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, enabled, onToggle }: {
  icon: React.ReactNode
  title: string
  enabled: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="text-indigo-600 dark:text-indigo-400">{icon}</div>
      <span className="font-semibold text-gray-900 dark:text-white text-sm">{title}</span>
      <button
        onClick={() => onToggle(!enabled)}
        className={`ml-auto relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-indigo-600' : 'bg-black/20 dark:bg-white/20'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4.5' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 dark:text-white/40 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-colors placeholder-gray-400 dark:placeholder-white/30'

// ─── Email form ───────────────────────────────────────────────────────────────

function EmailForm({ initial }: { initial: EmailConfig }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<EmailConfig>(initial)
  const [dirty, setDirty] = useState(false)

  const set = (patch: Partial<EmailConfig>) => {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
  }

  const save = useMutation({
    mutationFn: () => notificationsApi.updateEmail({ ...form }),
    onSuccess: () => { setDirty(false); void qc.invalidateQueries({ queryKey: ['notifications', 'config'] }) },
  })

  const toggle = useMutation({
    mutationFn: (v: boolean) => notificationsApi.updateEmail({ enabled: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications', 'config'] }),
  })

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={<Mail className="w-4 h-4" />}
        title="Email (SMTP)"
        enabled={form.enabled}
        onToggle={(v) => { set({ enabled: v }); toggle.mutate(v) }}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Servidor SMTP">
          <input type="text" value={form.host} onChange={(e) => set({ host: e.target.value })} placeholder="smtp.gmail.com" className={inputCls} />
        </Field>
        <Field label="Puerto">
          <input type="number" value={form.port} onChange={(e) => set({ port: parseInt(e.target.value) || 587 })} className={inputCls} />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="email-secure"
          checked={form.secure}
          onChange={(e) => set({ secure: e.target.checked })}
          className="w-4 h-4 rounded"
        />
        <label htmlFor="email-secure" className="text-sm text-gray-600 dark:text-white/60">SSL/TLS en conexión (puerto 465)</label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Usuario">
          <input type="text" value={form.user} onChange={(e) => set({ user: e.target.value })} placeholder="alerts@example.com" className={inputCls} />
        </Field>
        <Field label="Contraseña">
          <input type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="••••••••" className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Remitente (From)">
          <input type="text" value={form.from} onChange={(e) => set({ from: e.target.value })} placeholder="HomeNas <alerts@example.com>" className={inputCls} />
        </Field>
        <Field label="Destinatario (To)">
          <input type="text" value={form.to} onChange={(e) => set({ to: e.target.value })} placeholder="admin@example.com" className={inputCls} />
        </Field>
      </div>

      {dirty && (
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors"
        >
          {save.isPending ? 'Guardando…' : 'Guardar configuración email'}
        </button>
      )}
      {save.isSuccess && !dirty && (
        <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Guardado</p>
      )}
    </div>
  )
}

// ─── Telegram form ────────────────────────────────────────────────────────────

function TelegramForm({ initial }: { initial: TelegramConfig }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<TelegramConfig>(initial)
  const [dirty, setDirty] = useState(false)

  const set = (patch: Partial<TelegramConfig>) => {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
  }

  const save = useMutation({
    mutationFn: () => notificationsApi.updateTelegram({ ...form }),
    onSuccess: () => { setDirty(false); void qc.invalidateQueries({ queryKey: ['notifications', 'config'] }) },
  })

  const toggle = useMutation({
    mutationFn: (v: boolean) => notificationsApi.updateTelegram({ enabled: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications', 'config'] }),
  })

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={<Send className="w-4 h-4" />}
        title="Telegram Bot"
        enabled={form.enabled}
        onToggle={(v) => { set({ enabled: v }); toggle.mutate(v) }}
      />

      <Field label="Bot Token">
        <input
          type="password"
          value={form.token}
          onChange={(e) => set({ token: e.target.value })}
          placeholder="1234567890:ABCDef..."
          className={inputCls}
        />
        <p className="text-xs text-gray-400 dark:text-white/30 mt-1">Crea un bot con @BotFather y pega el token aquí.</p>
      </Field>

      <Field label="Chat ID">
        <input
          type="text"
          value={form.chatId}
          onChange={(e) => set({ chatId: e.target.value })}
          placeholder="-1001234567890"
          className={inputCls}
        />
        <p className="text-xs text-gray-400 dark:text-white/30 mt-1">ID del chat o canal. Obtén el tuyo con @userinfobot.</p>
      </Field>

      {dirty && (
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors"
        >
          {save.isPending ? 'Guardando…' : 'Guardar configuración Telegram'}
        </button>
      )}
      {save.isSuccess && !dirty && (
        <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Guardado</p>
      )}
    </div>
  )
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function NotificationsConfigCard() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications', 'config'],
    queryFn: () => notificationsApi.getConfig(),
    staleTime: 60_000,
  })

  const testMut = useMutation({
    mutationFn: () => notificationsApi.test(),
  })

  const onLoginMut = useMutation({
    mutationFn: (v: boolean) => notificationsApi.updateSettings({ onLogin: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications', 'config'] }),
  })

  if (isLoading) {
    return (
      <div className="rounded-xl bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 p-6">
        <div className="h-4 w-48 bg-black/10 dark:bg-white/10 rounded animate-pulse mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-3 bg-black/10 dark:bg-white/10 rounded animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 p-6">
        <p className="text-sm text-red-500 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Error al cargar la configuración de notificaciones</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3">
        <Bell className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h2 className="font-semibold text-gray-900 dark:text-white">Alertas y notificaciones</h2>
        <button
          onClick={() => testMut.mutate()}
          disabled={testMut.isPending}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-white/60 border border-black/10 dark:border-white/10 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-50 transition-colors"
        >
          {testMut.isPending ? 'Enviando…' : testMut.isSuccess ? '✓ Enviado' : 'Enviar prueba'}
        </button>
      </div>

      <div className="p-6 space-y-6 divide-y divide-black/5 dark:divide-white/5">
        {/* Email */}
        <div className="pt-0">
          <EmailForm initial={data.email} />
        </div>

        {/* Telegram */}
        <div className="pt-6">
          <TelegramForm initial={data.telegram} />
        </div>

        {/* Misc settings */}
        <div className="pt-6 space-y-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wider">Opciones de alerta</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.onLogin}
              onChange={(e) => onLoginMut.mutate(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <div>
              <p className="text-sm text-gray-900 dark:text-white">Alerta en cada inicio de sesión</p>
              <p className="text-xs text-gray-400 dark:text-white/30">Envía una notificación cada vez que alguien inicia sesión correctamente.</p>
            </div>
          </label>
        </div>
      </div>

      {/* Events description */}
      <div className="px-6 pb-5">
        <p className="text-xs text-gray-400 dark:text-white/30">
          Alertas automáticas: <span className="text-gray-500 dark:text-white/40">bloqueo de cuenta por brute force</span> · <span className="text-gray-500 dark:text-white/40">activación/desactivación de 2FA</span>
        </p>
      </div>
    </div>
  )
}
