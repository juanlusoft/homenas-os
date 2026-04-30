import { Plus, X } from 'lucide-react'
import type { VolumeMapping, VolumeMappingWithMode, VolumeMode } from './types'

// ─── Props ───────────────────────────────────────────────────────────────────

/**
 * Generic over the row type so callers can pass either a plain `VolumeMapping`
 * (install wizard, no mode) or a `VolumeMappingWithMode` (edit modal).
 */
export interface VolumesFieldProps<T extends VolumeMapping = VolumeMappingWithMode> {
  value: T[]
  onChange: (next: T[]) => void
  /** Optional error message rendered below the field. */
  error?: string
  /** Show + / × buttons to add and remove rows. Defaults to `true`. */
  allowAddRemove?: boolean
  /**
   * If `true` the container path input is rendered read-only as a code chip,
   * matching the install-wizard layout where the catalog dictates the
   * container side. Defaults to `false`.
   */
  lockContainerSide?: boolean
  /**
   * If `true` show a rw/ro select. Defaults to `true` for the new edit-flow
   * components but the install wizard sets it to `false` to preserve the
   * original UX (no mode toggle).
   */
  showMode?: boolean
  /**
   * Optional label resolver for each row. When it returns a non-empty string
   * it is used as the host-path label, otherwise the row's own `label` (or
   * a generic fallback) is used.
   */
  getRowLabel?: (row: T, index: number) => string | undefined
  /** Generic label shown above the host path input when no row label exists. */
  hostLabel?: string
  /** Aria label for the add button. */
  addLabel?: string
  /** Aria label for the remove buttons. */
  removeLabel?: string
  /** Stable id prefix for `<label htmlFor>`. */
  idPrefix?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VolumesField<T extends VolumeMapping = VolumeMappingWithMode>({
  value,
  onChange,
  error,
  allowAddRemove = true,
  lockContainerSide = false,
  showMode = true,
  getRowLabel,
  hostLabel = 'Host path',
  addLabel = 'Add volume',
  removeLabel = 'Remove volume',
  idPrefix = 'volumes-field',
}: VolumesFieldProps<T>) {
  const updateRow = (index: number, patch: Partial<VolumeMappingWithMode>) => {
    const next = value.map((row, i) =>
      i === index ? ({ ...row, ...patch } as T) : row,
    )
    onChange(next)
  }

  // The "empty row" only requires the base `VolumeMapping` shape; we cast to
  // `T` because the caller's schema is at least that wide.
  const addRow = () => {
    const empty = { hostPath: '', containerPath: '', mode: 'rw' as VolumeMode } as unknown as T
    onChange([...value, empty])
  }
  const removeRow = (index: number) => onChange(value.filter((_, i) => i !== index))

  const errorId = error ? `${idPrefix}-error` : undefined

  return (
    <div className="space-y-2" aria-describedby={errorId}>
      {value.map((row, i) => {
        // Read with the wider shape so `mode` is accessible when `T` does
        // not declare it (it will simply be `undefined`).
        const wide = row as VolumeMappingWithMode
        const rowLabel = getRowLabel?.(row, i) ?? row.label
        const hostId = `${idPrefix}-${i}-host`
        const containerId = `${idPrefix}-${i}-container`
        const modeId = `${idPrefix}-${i}-mode`
        return (
          <div key={i}>
            <label htmlFor={hostId} className="block text-gray-500 dark:text-white/40 text-xs mb-1">
              {rowLabel ?? hostLabel}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={hostId}
                type="text"
                value={row.hostPath}
                onChange={e => updateRow(i, { hostPath: e.target.value })}
                aria-invalid={Boolean(error)}
                className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
              />
              <div className="text-gray-400 dark:text-white/30 text-sm">→</div>

              {lockContainerSide ? (
                <code className="text-gray-400 dark:text-white/30 text-xs bg-white/3 px-2 py-1.5 rounded border border-black/5 dark:border-white/5">
                  {row.containerPath}
                </code>
              ) : (
                <input
                  id={containerId}
                  type="text"
                  value={row.containerPath}
                  onChange={e => updateRow(i, { containerPath: e.target.value })}
                  aria-label="Container path"
                  aria-invalid={Boolean(error)}
                  className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                />
              )}

              {showMode && (
                <select
                  id={modeId}
                  aria-label="Volume mode"
                  value={wide.mode ?? 'rw'}
                  onChange={e => updateRow(i, { mode: e.target.value as VolumeMode })}
                  className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1.5 text-gray-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="rw">rw</option>
                  <option value="ro">ro</option>
                </select>
              )}

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
