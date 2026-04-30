import type { ImageValue } from './types'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ImageFieldProps {
  value: ImageValue
  onChange: (next: ImageValue) => void
  /** Optional error message rendered below the field. */
  error?: string
  /**
   * When provided, the tag input is rendered as a `<select>` populated with
   * these options. Otherwise a free-text input is used.
   */
  availableTags?: string[]
  /** If `true` the image name input is read-only. */
  lockImage?: boolean
  /** Label for the image input. Defaults to "Image". */
  imageLabel?: string
  /** Label for the tag input. Defaults to "Tag". */
  tagLabel?: string
  /** Placeholder for the image input. */
  imagePlaceholder?: string
  /** Placeholder for the tag input. */
  tagPlaceholder?: string
  /** Stable id prefix for `<label htmlFor>`. */
  idPrefix?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

const IMAGE_PATTERN = /^[a-z0-9._\-/]+$/i
const TAG_PATTERN = /^[a-zA-Z0-9._-]+$/

export function ImageField({
  value,
  onChange,
  error,
  availableTags,
  lockImage = false,
  imageLabel = 'Image',
  tagLabel = 'Tag',
  imagePlaceholder = 'e.g. linuxserver/jellyfin',
  tagPlaceholder = 'e.g. latest',
  idPrefix = 'image-field',
}: ImageFieldProps) {
  const imageId = `${idPrefix}-image`
  const tagId = `${idPrefix}-tag`
  const errorId = error ? `${idPrefix}-error` : undefined

  // Light validation: highlight invalid characters via aria-invalid.
  const imageInvalid = value.image.length > 0 && !IMAGE_PATTERN.test(value.image)
  const tagInvalid = value.tag.length > 0 && !TAG_PATTERN.test(value.tag)
  const ariaInvalid = Boolean(error) || imageInvalid || tagInvalid

  return (
    <div className="space-y-2" aria-describedby={errorId}>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={imageId} className="block text-gray-500 dark:text-white/40 text-xs mb-1">
            {imageLabel}
          </label>
          <input
            id={imageId}
            type="text"
            value={value.image}
            onChange={e => onChange({ ...value, image: e.target.value })}
            readOnly={lockImage}
            placeholder={imagePlaceholder}
            aria-invalid={ariaInvalid}
            className={
              lockImage
                ? 'w-full bg-white/3 border border-black/5 dark:border-white/5 rounded-lg px-3 py-1.5 text-gray-400 dark:text-white/30 text-sm font-mono'
                : 'w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:border-indigo-500'
            }
          />
        </div>

        <div className="text-gray-400 dark:text-white/30 text-sm pb-1.5">:</div>

        <div className="w-40">
          <label htmlFor={tagId} className="block text-gray-500 dark:text-white/40 text-xs mb-1">
            {tagLabel}
          </label>
          {availableTags && availableTags.length > 0 ? (
            <select
              id={tagId}
              value={value.tag}
              onChange={e => onChange({ ...value, tag: e.target.value })}
              aria-invalid={ariaInvalid}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
            >
              {availableTags.map(tag => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={tagId}
              type="text"
              value={value.tag}
              onChange={e => onChange({ ...value, tag: e.target.value })}
              placeholder={tagPlaceholder}
              aria-invalid={ariaInvalid}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
            />
          )}
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
