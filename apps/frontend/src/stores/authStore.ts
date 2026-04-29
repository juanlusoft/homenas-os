import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AuthState {
  sessionId: string | null
  csrfToken: string | null
  user: { id: number; username: string; role: 'admin' | 'user' } | null
  isAuthenticated: boolean
  login(data: { sessionId: string; csrfToken: string; user: { id: number; username: string; role: 'admin' | 'user' } }): void
  logout(): void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      sessionId: null,
      csrfToken: null,
      user: null,
      isAuthenticated: false,
      login: (data) => set({ ...data, isAuthenticated: true }),
      logout: () => set({ sessionId: null, csrfToken: null, user: null, isAuthenticated: false }),
    }),
    { name: 'homenas-auth', storage: createJSONStorage(() => sessionStorage) }
  )
)
