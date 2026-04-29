import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface UIState {
  sidebarCollapsed: boolean
  toggleSidebar(): void
  theme: 'dark' | 'light'
  toggleTheme(): void
  lang: 'es' | 'en'
  toggleLang(): void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      theme: 'dark',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      lang: 'es',
      toggleLang: () => set((s) => ({ lang: s.lang === 'es' ? 'en' : 'es' })),
    }),
    { name: 'homenas-ui', storage: createJSONStorage(() => localStorage) }
  )
)
