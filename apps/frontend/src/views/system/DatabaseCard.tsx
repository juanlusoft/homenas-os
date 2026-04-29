import { useState } from 'react'
import { Database, Download, ShieldCheck, CheckCircle, XCircle } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { systemApi } from '../../api/system'
import { useT } from '../../i18n/useT'

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 p-5">
      {children}
    </div>
  )
}

export function DatabaseCard() {
  const t = useT()
  const [integrityResult, setIntegrityResult] = useState<{ ok: boolean; details: string[] } | null>(null)

  const integrityMut = useMutation({
    mutationFn: () => systemApi.db.integrity(),
    onSuccess: (data) => setIntegrityResult(data),
  })

  const backupMut = useMutation({
    mutationFn: () => systemApi.db.backup(),
  })

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4 text-gray-600 dark:text-gray-300">
        <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        <span className="text-sm font-semibold uppercase tracking-wider">{t.system.database}</span>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <button
          onClick={() => backupMut.mutate()}
          disabled={backupMut.isPending}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {backupMut.isPending ? t.system.downloadingBackup : t.system.dbBackup}
        </button>

        <button
          onClick={() => { setIntegrityResult(null); integrityMut.mutate() }}
          disabled={integrityMut.isPending}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <ShieldCheck className="w-4 h-4" />
          {integrityMut.isPending ? t.system.checkingIntegrity : t.system.dbIntegrity}
        </button>
      </div>

      {integrityResult && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
          integrityResult.ok
            ? 'bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400'
        }`}>
          {integrityResult.ok
            ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          }
          <div>
            <p className="font-medium">
              {integrityResult.ok ? t.system.dbIntegrityOk : t.system.dbIntegrityFail}
            </p>
            {!integrityResult.ok && (
              <ul className="mt-1 space-y-0.5 text-xs opacity-80">
                {integrityResult.details.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {integrityMut.isError && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-2">
          {t.common.error}: {integrityMut.error instanceof Error ? integrityMut.error.message : String(integrityMut.error)}
        </p>
      )}
    </Card>
  )
}
