import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useUIStore } from '../../stores/uiStore'
import { cn } from '../../lib/utils'

export function AppLayout() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
      <Sidebar />
      <main
        className={cn(
          'transition-all duration-200 ease-in-out min-h-screen',
          collapsed ? 'ml-16' : 'ml-56'
        )}
      >
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
