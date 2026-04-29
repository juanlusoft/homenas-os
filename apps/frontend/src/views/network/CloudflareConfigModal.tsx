import { useState } from 'react'
import { X, Loader2, ExternalLink } from 'lucide-react'
import { useConfigure } from '../../hooks/useCloudflare'

interface CloudflareConfigModalProps {
  onClose: () => void
}

export function CloudflareConfigModal({ onClose }: CloudflareConfigModalProps) {
  const [token, setToken] = useState('')
  const configure = useConfigure()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) return
    try {
      await configure.mutateAsync(token.trim())
      onClose()
    } catch {
      // error shown inline
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-2xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10">
          <h2 className="font-semibold text-gray-900 dark:text-white">Configurar Cloudflare Tunnel</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:bg-black/10 dark:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-white/50 font-medium mb-1.5">
              Token del tunnel
            </label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJhIjoiL..."
              autoFocus
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 font-mono"
            />
          </div>

          <p className="text-xs text-gray-500 dark:text-white/40">
            Obtén el token en{' '}
            <a
              href="https://dash.cloudflare.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-0.5"
            >
              dash.cloudflare.com
              <ExternalLink className="w-3 h-3" />
            </a>{' '}
            &rarr; Zero Trust &rarr; Networks &rarr; Tunnels &rarr; Create a tunnel &rarr;
            Cloudflared.
          </p>

          {configure.error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {configure.error instanceof Error ? configure.error.message : 'Error al configurar el tunnel'}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:bg-white/15 text-gray-900 dark:text-white text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!token.trim() || configure.isPending}
              className="flex-1 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {configure.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {configure.isPending ? 'Configurando...' : 'Configurar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
