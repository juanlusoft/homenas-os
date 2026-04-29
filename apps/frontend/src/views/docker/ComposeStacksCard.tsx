import { useEffect, useRef, useState } from 'react'
import {
  ArrowUp, ArrowDown, RefreshCw, Download,
} from 'lucide-react'
import { useComposeStacks, useComposeAction, useComposeProgress } from '../../hooks/useDocker'
import type { ComposeStack } from '@homenas/shared'
import { useT } from '../../i18n/useT'

function StackStatusBadge({ status }: { status: ComposeStack['status'] }) {
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-500/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        running
      </span>
    )
  }
  if (status === 'partial') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
        partial
      </span>
    )
  }
  if (status === 'stopped') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-red-500/20 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        stopped
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-black/10 dark:bg-white/10 text-gray-500 dark:text-white/50 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
      unknown
    </span>
  )
}

interface StackCardProps {
  stack: ComposeStack
  onAction: (path: string, action: string) => void
  pending: boolean
  isActive: boolean
}

function StackCard({ stack, onAction, pending, isActive }: StackCardProps) {
  const [confirmAction, setConfirmAction] = useState<string | null>(null)
  const { data: progress } = useComposeProgress()
  const progressBottomRef = useRef<HTMLDivElement>(null)
  const t = useT()

  // Auto-scroll progress output
  useEffect(() => {
    if (progress?.output?.length) {
      progressBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [progress?.output?.length])

  function handleAction(action: string) {
    if (action === 'down') {
      setConfirmAction(action)
      return
    }
    onAction(stack.path, action)
  }

  function handleConfirm() {
    if (confirmAction) {
      onAction(stack.path, confirmAction)
      setConfirmAction(null)
    }
  }

  return (
    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-gray-900 dark:text-white font-medium truncate">{stack.name}</h3>
          <p className="text-gray-500 dark:text-white/40 text-xs font-mono truncate mt-0.5" title={stack.path}>
            {stack.path}
          </p>
        </div>
        <StackStatusBadge status={stack.status} />
      </div>

      {/* Container count */}
      <div className="text-xs text-gray-500 dark:text-white/50">
        <span className="text-gray-700 dark:text-white/70 font-medium">{stack.runningCount}</span>
        <span className="text-gray-400 dark:text-white/30">/{stack.containerCount}</span>
        <span className="text-gray-500 dark:text-white/40 ml-1">containers running</span>
      </div>

      {/* Services */}
      {stack.services.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stack.services.map((svc) => (
            <span key={svc} className="text-xs font-mono bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/60 px-2 py-0.5 rounded">
              {svc}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          title="Up"
          disabled={pending}
          onClick={() => handleAction('up')}
          className="flex items-center gap-1.5 text-xs font-medium bg-green-500/20 hover:bg-green-500/30 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          <ArrowUp className="w-3.5 h-3.5" />
          Up
        </button>
        <button
          title="Down"
          disabled={pending}
          onClick={() => handleAction('down')}
          className="flex items-center gap-1.5 text-xs font-medium bg-red-500/20 hover:bg-red-500/30 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          Down
        </button>
        <button
          title="Pull"
          disabled={pending}
          onClick={() => handleAction('pull')}
          className="flex items-center gap-1.5 text-xs font-medium bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" />
          Pull
        </button>
        <button
          title="Restart"
          disabled={pending}
          onClick={() => handleAction('restart')}
          className="flex items-center gap-1.5 text-xs font-medium bg-violet-500/20 hover:bg-violet-500/30 text-violet-600 dark:text-violet-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Restart
        </button>
      </div>

      {/* Progress log — shown when compose operation is running for this stack */}
      {isActive && progress && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
              {progress.running ? `Running: ${progress.action}` : `Finished: ${progress.action}`}
            </span>
          </div>
          {progress.output.length > 0 && (
            <div className="bg-black/40 border border-black/5 dark:border-white/5 rounded-lg p-3 max-h-48 overflow-y-auto">
              <pre className="text-xs font-mono text-gray-600 dark:text-white/60 whitespace-pre-wrap leading-relaxed">
                {progress.output.join('\n')}
              </pre>
              <div ref={progressBottomRef} />
            </div>
          )}
          {progress.error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 font-mono">
              {progress.error}
            </p>
          )}
        </div>
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-gray-900 dark:text-white font-semibold">{t.docker.confirmAction}</h3>
            <p className="text-gray-600 dark:text-white/60 text-sm">
              Run <span className="font-mono text-red-700 dark:text-red-300">docker compose {confirmAction}</span> on{' '}
              <span className="font-mono text-gray-900 dark:text-white">{stack.name}</span>?{' '}
              {t.docker.willStopServices}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className="text-sm text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-lg hover:bg-black/10 dark:bg-white/10 transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleConfirm}
                className="text-sm font-medium bg-red-500/20 hover:bg-red-500/30 text-red-700 dark:text-red-300 px-4 py-2 rounded-lg transition-colors"
              >
                {t.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ComposeStacksCard() {
  const { data: stacks, isLoading } = useComposeStacks()
  const actionMutation = useComposeAction()
  const { data: progress } = useComposeProgress()
  const [activeStackPath, setActiveStackPath] = useState<string | null>(null)
  const t = useT()

  function handleAction(path: string, action: string) {
    setActiveStackPath(path)
    actionMutation.mutate({
      path,
      action: action as import('@homenas/shared').ComposeAction['action'],
    })
  }

  return (
    <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h2 className="font-semibold text-gray-900 dark:text-white">{t.docker.stacksTitle}</h2>
        </div>
        {progress?.running && (
          <span className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            {t.docker.operationRunning}
          </span>
        )}
      </div>

      <div className="p-4">
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-32 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && stacks?.length === 0 && (
          <div className="text-center py-8 text-gray-400 dark:text-white/30 text-sm">
            {t.docker.noStacks('/opt/stacks')}
          </div>
        )}

        {stacks && stacks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stacks.map((stack) => (
              <StackCard
                key={stack.path}
                stack={stack}
                onAction={handleAction}
                pending={actionMutation.isPending}
                isActive={activeStackPath === stack.path}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
