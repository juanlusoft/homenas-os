import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { useT } from '../../i18n/useT'

export function LoginView() {
  const t = useT()
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const theme = useUIStore((s) => s.theme)

  // Step 1: credentials — Step 2: TOTP code
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials')
  const [pending, setPending] = useState<{ username: string; password: string } | null>(null)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const totpRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [theme])

  useEffect(() => {
    if (step === 'totp') totpRef.current?.focus()
  }, [step])

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setError(null)
    setLoading(true)
    try {
      const result = await authApi.login({ username, password })
      login(result)
      navigate('/', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.auth.loginFailed
      // Server told us TOTP is required.
      // TODO: backend returns a structured `requireTotp: true` flag in the
      // 401 body — surface it through apiFetch (e.g. throw a typed
      // ApiError with the parsed body) instead of pattern-matching the
      // human-readable message. The string check here is a stop-gap that
      // breaks if the message is ever localised. Until then, keep matching
      // both the plain string and the legacy flag name.
      if (msg.includes('TOTP') || msg.includes('requireTotp')) {
        setPending({ username, password })
        setStep('totp')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pending || totpCode.length !== 6) return
    setError(null)
    setLoading(true)
    try {
      const result = await authApi.login({ ...pending, totpCode })
      login(result)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.loginFailed)
      setTotpCode('')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors'
  const btnCls = 'w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mt-2'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl p-8 w-full max-w-sm shadow-lg">
        {/* Logo / Title */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/30 mb-4">
            <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Home<span className="text-indigo-600 dark:text-indigo-400">Nas</span> OS
          </h1>
          <p className="text-sm text-gray-500 dark:text-white/40 mt-1">
            {step === 'totp' ? 'Two-factor authentication' : t.auth.signInToYourNas}
          </p>
        </div>

        {step === 'credentials' ? (
          <form onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">{t.auth.username}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                className={inputCls}
                placeholder="admin"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">{t.auth.password}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className={inputCls}
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            <button type="submit" disabled={loading} className={btnCls}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t.auth.loggingIn}
                </span>
              ) : t.auth.signIn}
            </button>
          </form>
        ) : (
          <form onSubmit={handleTotp} className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-white/50 text-center">
              Enter the 6-digit code from your authenticator app.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Authentication code</label>
              <input
                ref={totpRef}
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                className={`${inputCls} text-center text-xl tracking-widest font-mono`}
                placeholder="000000"
              />
            </div>
            {error && (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            <button type="submit" disabled={loading || totpCode.length !== 6} className={btnCls}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verifying…
                </span>
              ) : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('credentials'); setTotpCode(''); setError(null) }}
              className="w-full text-sm text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 transition-colors"
            >
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
