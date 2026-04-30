import type { ResourcesValue } from './types'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ResourcesFieldProps {
  value: ResourcesValue
  onChange: (next: ResourcesValue) => void
  /** Optional error message rendered below the field. */
  error?: string
  /** Label for the cpus input. Defaults to "CPUs". */
  cpusLabel?: string
  /** Label for the memory input. Defaults to "Memory". */
  memoryLabel?: string
  /** Placeholder for the cpus input. */
  cpusPlaceholder?: string
  /** Placeholder for the memory input. */
  memoryPlaceholder?: string
  /** Stable id prefix for `<label htmlFor>`. */
  idPrefix?: string
}

// Light validation:
//   cpus:   decimal numbers like "0.5", "2"
//   memory: docker style like "256m", "1g", "512mb", "2gb"
const CPUS_PATTERN = /^\d+(\.\d+)?$/
const MEMORY_PATTERN = /^\d+(\.\d+)?\s*(b|k|kb|m|mb|g|gb)?$/i

// ─── Component ───────────────────────────────────────────────────────────────

export function ResourcesField({
  value,
  onChange,
  error,
  cpusLabel = 'CPUs',
  memoryLabel = 'Memory',
  cpusPlaceholder = 'e.g. 0.5 or 2',
  memoryPlaceholder = 'e.g. 256m or 1g',
  idPrefix = 'resources-field',
}: ResourcesFieldProps) {
  const cpusId = `${idPrefix}-cpus`
  const memoryId = `${idPrefix}-memory`
  const errorId = error ? `${idPrefix}-error` : undefined

  const cpusInvalid = value.cpus.length > 0 && !CPUS_PATTERN.test(value.cpus)
  const memoryInvalid = value.memory.length > 0 && !MEMORY_PATTERN.test(value.memory)
  const ariaInvalid = Boolean(error) || cpusInvalid || memoryInvalid

  return (
    <div className="space-y-2" aria-describedby={errorId}>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={cpusId} className="block text-gray-500 dark:text-white/40 text-xs mb-1">
            {cpusLabel}
          </label>
          <input
            id={cpusId}
            type="text"
            inputMode="decimal"
            value={value.cpus}
            onChange={e => onChange({ ...value, cpus: e.target.value })}
            placeholder={cpusPlaceholder}
            aria-invalid={ariaInvalid}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex-1">
          <label htmlFor={memoryId} className="block text-gray-500 dark:text-white/40 text-xs mb-1">
            {memoryLabel}
          </label>
          <input
            id={memoryId}
            type="text"
            value={value.memory}
            onChange={e => onChange({ ...value, memory: e.target.value })}
            placeholder={memoryPlaceholder}
            aria-invalid={ariaInvalid}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {error && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
