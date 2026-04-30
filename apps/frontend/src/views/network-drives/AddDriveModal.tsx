import { useState } from 'react'
import { X, Globe } from 'lucide-react'
import { useAddDrive } from '../../hooks/useNetworkDrives'
import type { DriveType } from '../../api/network-drives'
import { useT } from '../../i18n/useT'

type FieldDef = {
  key: string
  label: string
  placeholder?: string
  inputType?: 'password' | 'number'
  optional?: boolean
}

const DRIVE_TYPES: { value: DriveType; label: string; fields: FieldDef[] }[] = [
  {
    value: 'webdav',
    label: 'WebDAV',
    fields: [
      { key: 'url',    label: 'URL',                        placeholder: 'https://ejemplo.com/dav' },
      { key: 'user',   label: 'Usuario' },
      { key: 'pass',   label: 'Contraseña',                 inputType: 'password' },
      { key: 'vendor', label: 'Proveedor',                  placeholder: 'nextcloud / owncloud / other', optional: true },
    ],
  },
  {
    value: 'sftp',
    label: 'SFTP',
    fields: [
      { key: 'host', label: 'Host',   placeholder: 'servidor.ejemplo.com' },
      { key: 'port', label: 'Puerto', placeholder: '22', inputType: 'number' },
      { key: 'user', label: 'Usuario' },
      { key: 'pass', label: 'Contraseña', inputType: 'password' },
    ],
  },
  {
    value: 's3',
    label: 'S3 / Compatible',
    fields: [
      { key: 'access_key_id',     label: 'Access Key ID' },
      { key: 'secret_access_key', label: 'Secret Access Key', inputType: 'password' },
      { key: 'region',            label: 'Región',             placeholder: 'us-east-1' },
      { key: 'endpoint',          label: 'Endpoint',           placeholder: 'https://s3.ejemplo.com', optional: true },
    ],
  },
  {
    value: 'smb',
    label: 'SMB / Windows',
    fields: [
      { key: 'host',   label: 'Host',    placeholder: '192.168.1.100' },
      { key: 'user',   label: 'Usuario' },
      { key: 'pass',   label: 'Contraseña', inputType: 'password' },
      { key: 'domain', label: 'Dominio', placeholder: 'WORKGROUP', optional: true },
    ],
  },
  {
    value: 'ftp',
    label: 'FTP',
    fields: [
      { key: 'host', label: 'Host' },
      { key: 'port', label: 'Puerto', placeholder: '21', inputType: 'number' },
      { key: 'user', label: 'Usuario' },
      { key: 'pass', label: 'Contraseña', inputType: 'password' },
    ],
  },
  {
    value: 'b2',
    label: 'Backblaze B2',
    fields: [
      { key: 'account', label: 'Account ID' },
      { key: 'key',     label: 'Application Key', inputType: 'password' },
    ],
  },
]

export function AddDriveModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const addDrive = useAddDrive()
  const [name, setName] = useState('')
  const [type, setType] = useState<DriveType>('webdav')
  const [config, setConfig] = useState<Record<string, string>>({})
  const [autoMount, setAutoMount] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const typeDef = DRIVE_TYPES.find(d => d.value === type)!

  const handleTypeChange = (newType: DriveType) => {
    setType(newType)
    setConfig({})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await addDrive.mutateAsync({ name, type, config, auto_mount: autoMount })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-black/10 dark:border-white/10 sticky top-0 bg-white dark:bg-gray-900">
          <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <h2 className="font-semibold text-gray-900 dark:text-white">{t.networkDrives.addTitle}</h2>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1">
              {t.networkDrives.nameLabel}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t.networkDrives.namePlaceholder}
              required
              pattern="[a-zA-Z0-9_-]+"
              title="Solo letras, números, guiones y guiones bajos"
              className="w-full px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1">
              {t.networkDrives.typeLabel}
            </label>
            <select
              value={type}
              onChange={e => handleTypeChange(e.target.value as DriveType)}
              className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-black/10 dark:border-white/10 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {DRIVE_TYPES.map(d => (
                <option key={d.value} value={d.value} className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white">{d.label}</option>
              ))}
            </select>
          </div>

          {/* Dynamic config fields */}
          {typeDef.fields.map(field => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1">
                {field.label}
                {field.optional && (
                  <span className="ml-1 text-gray-400 dark:text-white/30 font-normal">(opcional)</span>
                )}
              </label>
              <input
                type={field.inputType ?? 'text'}
                value={config[field.key] ?? ''}
                onChange={e => setConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                required={!field.optional}
                autoComplete={field.inputType === 'password' ? 'new-password' : undefined}
                className="w-full px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
              />
            </div>
          ))}

          {/* Auto-mount toggle */}
          <label className="flex items-center gap-3 cursor-pointer pt-1">
            <button
              type="button"
              role="switch"
              aria-checked={autoMount}
              onClick={() => setAutoMount(p => !p)}
              className={`relative w-9 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${autoMount ? 'bg-indigo-600' : 'bg-black/20 dark:bg-white/20'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoMount ? 'translate-x-4' : ''}`} />
            </button>
            <span className="text-sm text-gray-700 dark:text-white/70">{t.networkDrives.autoMount}</span>
          </label>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-white/70 transition-colors"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={addDrive.isPending}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {addDrive.isPending && (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {addDrive.isPending ? t.networkDrives.adding : t.common.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
