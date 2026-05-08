import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

function isChunkLoadError(error: Error): boolean {
  return (
    error.message.includes('Failed to fetch dynamically imported module') ||
    error.message.includes('Importing a module script failed') ||
    error.message.includes('Unable to preload CSS')
  )
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    // Auto-reload for chunk load failures (e.g., after OTA update changes JS hashes)
    if (isChunkLoadError(error)) {
      window.location.reload()
      return { error: null }
    }
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8 max-w-md w-full text-center space-y-4">
            <p className="text-red-600 dark:text-red-400 font-semibold">Algo fue mal al cargar la aplicación</p>
            <p className="text-gray-500 dark:text-white/40 text-sm font-mono break-all">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 text-gray-900 dark:text-white text-sm rounded-lg transition-colors"
            >
              Recargar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
