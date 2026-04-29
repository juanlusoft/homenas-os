import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useContainerLogs } from '../../hooks/useDocker'
import { useT } from '../../i18n/useT'

interface LogsModalProps {
  containerId: string
  containerName: string
  onClose: () => void
}

export function LogsModal({ containerId, containerName, onClose }: LogsModalProps) {
  const { data, isLoading, error } = useContainerLogs(containerId, 200)
  const bottomRef = useRef<HTMLDivElement>(null)
  const t = useT()

  // Auto-scroll to bottom when logs load
  useEffect(() => {
    if (data?.logs) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [data?.logs])

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-50 dark:bg-gray-950 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl w-full max-w-4xl mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 dark:border-white/10 shrink-0">
          <div>
            <h3 className="text-gray-900 dark:text-white font-semibold text-sm">{t.docker.containerLogs}</h3>
            <p className="text-gray-500 dark:text-white/40 text-xs font-mono mt-0.5">{containerName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white p-1.5 rounded-lg hover:bg-black/10 dark:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4">
          {isLoading && (
            <p className="text-gray-500 dark:text-white/40 text-xs font-mono animate-pulse">{t.docker.loadingLogs}</p>
          )}
          {error && (
            <p className="text-red-600 dark:text-red-400 text-xs font-mono">
              {t.docker.errorLoadingLogs} {error.message}
            </p>
          )}
          {data?.logs && (
            <pre className="text-xs font-mono text-gray-700 dark:text-white/70 whitespace-pre-wrap leading-relaxed">
              {data.logs}
            </pre>
          )}
          {data?.logs === '' && (
            <p className="text-gray-400 dark:text-white/30 text-xs font-mono">{t.docker.noLogs}</p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
