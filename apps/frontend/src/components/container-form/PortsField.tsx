import { Plus, X } from 'lucide-react'
import type { PortMapping } from './types'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface PortsFieldProps {
  value: PortMapping[]
  onChange: (next: PortMapping[]) => void
  /** Optional error message rendered below the field. */
  error?: string
  /** Show + / × buttons to add and remove rows. Defaults to `true`. */
  allowAddRemove?: boolean
  /**
   * If `true` the container port input is rendered read-only and the protocol
   * is shown as a static label. Defaults to `false`.
   * The install wizard sets this to `true` because the catalog dictates the
   * container side and protocol.
   */
  lockContainerSide?: boolean
  /**
   * Optional label resolver for each row. Receives the row and its index;
   * if it returns a non-empty string it is used as the host-port label,
   * otherwise the row's own `label` (or a generic fallback) is used.
   */
  getRowLabel?: (row: PortMapping, index: number) => string | undefined
  /** Generic label shown above the host port input when no row label exists. */
  hostLabel?: string
  /** Generic label shown above the container port input. */
  containerLabel?: string
  /** Aria label for the add button. */
  addLabel?: string
  /** Aria label for the remove buttons. */
  removeLabel?: string
  /** Stable id prefix for `<label htmlFor>`. */
  idPrefix?: string
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_PROTOCOL: PortMapping['protocol'] = 'tcp'

function emptyRow(): PortMapping {
  return { hostPort: 0, containerPort: 0, protocol: DEFAULT_PROTOCOL }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PortsField({
  value,
  onChange,
  error,
  allowAddRemove = true,
  lockContainerSide = false,
  getRowLabel,
  hostLabel = 'Host',
  containerLabel = 'Container',
  addLabel = 'Add port',
  removeLabel = 'Remove port',
  idPrefix = 'ports-field',
}: PortsFieldProps) {
  const updateRow = (index: number, patch: Partial<PortMapping>) => {
    const next = value.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange(next)
  }

  const addRow = () => onChange([...value, emptyRow()])
  const removeRow = (index: number) => onChange(value.filter((_, i) => i !== index))

  const errorId = error ? `${idPrefix}-error` : undefined

  return (
    <div className="space-y-2" aria-describedby={errorId}>
      {value.map((row, i) => {
        const rowLabel = getRowLabel?.(row, i) ?? row.label
        const hostId = `${idPrefix}-${i}-host`
        const containerId = `${idPrefix}-${i}-container`
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1">
              <label htmlFor={hostId} className="block text-gray-500 dark:text-white/40 text-xs mb-1">
                {rowLabel ?? hostLabel}
              </label>
              <input
                id={hostId}
                type="number"
                min={1}
                max={65535}
                value={row.hostPort}
                onChange={e => updateRow(i, { hostPort: parseInt(e.target.value, 10) || row.hostPort })}
                aria-invalid={Boolean(error)}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="pt-5 text-gray-400 dark:text-white/30 text-sm">→</div>

            <div className="flex-1">
              <label htmlFor={containerId} className="block text-gray-500 dark:text-white/40 text-xs mb-1">
                {containerLabel}
              </label>
              <input
                id={containerId}
                type="number"
                min={1}
                max={65535}
                value={row.containerPort}
                readOnly={lockContainerSide}
                onChange={
                  lockContainerSide
                    ? undefined
                    : e => updateRow(i, { containerPort: parseInt(e.target.value, 10) || row.containerPort })
                }
                aria-invalid={Boolean(error)}
                className={
                  lockContainerSide
                    ? 'w-full bg-white/3 border border-black/5 dark:border-white/5 rounded-lg px-3 py-1.5 text-gray-400 dark:text-white/30 text-sm'
                    : 'w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500'
                }
              />
            </div>

            {lockContainerSide ? (
              <div className="pt-5 text-gray-400 dark:text-white/30 text-xs w-8 text-center">{row.protocol}</div>
            ) : (
              <div className="pt-5 w-16">
                <select
                  aria-label="Protocol"
                  value={row.protocol}
                  onChange={e => updateRow(i, { protocol: e.target.value as PortMapping['protocol'] })}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1.5 text-gray-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="tcp">tcp</option>
                  <option value="udp">udp</option>
                </select>
              </div>
            )}

            {allowAddRemove && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                title={removeLabel}
                aria-label={removeLabel}
                className="mt-5 flex items-center justify-center w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-red-500/10 text-gray-500 dark:text-white/50 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
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
