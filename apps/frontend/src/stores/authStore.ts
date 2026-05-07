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
    // TODO(security): sessionId lives in sessionStorage so it is reachable from
    // any JS that runs in this origin — a single XSS would exfiltrate the
    // session and CSRF token. Proper fix: move auth to an HttpOnly + Secure +
    // SameSite=Strict cookie set by the backend (already partially in place
    // via X-CSRF-Token header). Keeping sessionStorage for now to avoid a
    // backend change and a forced logout for every existing user.
    { name: 'homenas-auth', storage: createJSONStorage(() => sessionStorage) }
  )
)
