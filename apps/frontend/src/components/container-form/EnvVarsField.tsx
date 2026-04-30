import { Plus, X } from 'lucide-react'
import type { EnvVar } from './types'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface EnvVarsFieldProps {
  value: EnvVar[]
  onChange: (next: EnvVar[]) => void
  /** Optional error message rendered below the field. */
  error?: string
  /** Show + / × buttons to add and remove rows. Defaults to `true`. */
  allowAddRemove?: boolean
  /**
   * If `true` the `key` is rendered as a static code chip (the install wizard
   * uses this since the catalog defines the env keys). Defaults to `false`.
   */
  lockKey?: boolean
  /**
   * Optional label resolver for each row. When it returns a non-empty string
   * it is used as the row label, otherwise the row's own `label` (or the
   * key itself) is used.
   */
  getRowLabel?: (row: EnvVar, index: number) => string | undefined
  /** Placeholder text for non-secret value inputs. */
  valuePlaceholder?: string
  /** Placeholder text for secret value inputs. */
  secretPlaceholder?: string
  /** Aria label for the add button. */
  addLabel?: string
  /** Aria label for the remove buttons. */
  removeLabel?: string
  /** Stable id prefix for `<label htmlFor>`. */
  idPrefix?: string
}

// ─── Defaults ────────────────────────────────────────────────────────────────

function emptyRow(): EnvVar {
  return { key: '', value: '' }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EnvVarsField({
  value,
  onChange,
  error,
  allowAddRemove = true,
  lockKey = false,
  getRowLabel,
  valuePlaceholder = 'value',
  secretPlaceholder = '••••••••',
  addLabel = 'Add variable',
  removeLabel = 'Remove variable',
  idPrefix = 'envvars-field',
}: EnvVarsFieldProps) {
  const updateRow = (index: number, patch: Partial<EnvVar>) => {
    const next = value.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange(next)
  }

  const addRow = () => onChange([...value, emptyRow()])
  const removeRow = (index: number) => onChange(value.filter((_, i) => i !== index))

  const errorId = error ? `${idPrefix}-error` : undefined

  return (
    <div className="space-y-2" aria-describedby={errorId}>
      {value.map((row, i) => {
        const rowLabel = getRowLabel?.(row, i) ?? row.label ?? row.key
        const keyId = `${idPrefix}-${i}-key`
        const valueId = `${idPrefix}-${i}-value`
        return (
          <div key={i}>
            <label htmlFor={lockKey ? valueId : keyId} className="block text-gray-500 dark:text-white/40 text-xs mb-1">
              {rowLabel}
            </label>
            <div className="flex items-center gap-2">
              {lockKey ? (
                <code className="text-gray-400 dark:text-white/30 text-xs bg-white/3 px-2 py-2 rounded border border-black/5 dark:border-white/5 shrink-0">
                  {row.key}
                </code>
              ) : (
                <input
                  id={keyId}
                  type="text"
                  value={row.key}
                  onChange={e => updateRow(i, { key: e.target.value })}
                  placeholder="KEY"
                  aria-label="Variable name"
                  aria-invalid={Boolean(error)}
                  className="w-44 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white text-sm font-mono uppercase focus:outline-none focus:border-indigo-500"
                />
              )}

              <input
                id={valueId}
                type={row.secret ? 'password' : 'text'}
                value={row.value}
                onChange={e => updateRow(i, { value: e.target.value })}
                placeholder={row.secret ? secretPlaceholder : valuePlaceholder}
                aria-invalid={Boolean(error)}
                className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
              />

              {allowAddRemove && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  title={removeLabel}
                  aria-label={removeLabel}
                  className="flex items-center justify-center w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-red-500/10 text-gray-500 dark:text-white/50 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )
      })}

      {allowAddRemove && (
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {addLabel}
        </button>
      )}

      {error && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
