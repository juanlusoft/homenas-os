import { useEffect, useMemo, useState } from 'react'
import { useEditApp, useContainerConfig } from '../../hooks/useHomeStore'
import { useT } from '../../i18n/useT'
import type {
  CatalogApp,
  EditPayload,
  EditResponse,
  PortMapping,
  VolumeMapping,
  EnvVar,
} from '@homenas/shared'
import { ImageField } from './ImageField'
import { PortsField } from './PortsField'
import { VolumesField } from './VolumesField'
import { EnvVarsField } from './EnvVarsField'
import { ResourcesField } from './ResourcesField'
import type {
  ImageValue,
  ResourcesValue,
  VolumeMappingWithMode,
} from './types'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ContainerEditModalProps {
  container: CatalogApp
  isOpen: boolean
  onClose: () => void
  /** Called after a successful recreate. Receives the updated CatalogApp. */
  onSaved: (updated: CatalogApp) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Split a docker image reference like "linuxserver/jellyfin:latest" into
 * `{ image, tag }`. If no tag is present we default to "latest" — the same
 * convention docker uses on `docker pull`.
 *
 * Note: we only split on the *last* colon to support hosts with ports
 * (e.g. "ghcr.io:443/foo/bar:1.0").
 */
function parseImageRef(ref: string): ImageValue {
  if (!ref) return { image: '', tag: 'latest' }
  const lastColon = ref.lastIndexOf(':')
  const lastSlash = ref.lastIndexOf('/')
  // If the last colon is before the last slash, it's a port — not a tag.
  if (lastColon === -1 || lastColon < lastSlash) {
    return { image: ref, tag: 'latest' }
  }
  return {
    image: ref.slice(0, lastColon),
    tag: ref.slice(lastColon + 1),
  }
}

function joinImageRef(value: ImageValue): string {
  const tag = value.tag.trim() || 'latest'
  return `${value.image.trim()}:${tag}`
}

/** Stable JSON for deep equality checks of plain data structures. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ContainerEditModal({
  container,
  isOpen,
  onClose,
  onSaved,
}: ContainerEditModalProps) {
  const t = useT()
  const editMutation = useEditApp()

  // ── Fetch the *real* persisted config ──────────────────────────────────────
  //
  // The form must reflect what's actually running, not the catalog defaults.
  // We fetch on open (`enabled = isOpen`) with `staleTime: 0` so reopening
  // after an external change still gives us fresh data.
  const configQuery = useContainerConfig(container.id, isOpen)
  const config = configQuery.data

  // ── Initial values ─────────────────────────────────────────────────────────
  //
  // Derived strictly from the persisted config. While the query is loading we
  // hold a neutral "empty" baseline so the form doesn't flash catalog defaults
  // and the diff detector won't fire spuriously. Empty arrays from the server
  // are honoured verbatim — the user may have explicitly chosen "no envVars",
  // we must not silently re-populate from the catalog.
  const initialImage = useMemo<ImageValue>(
    () => (config ? parseImageRef(config.dockerImage) : { image: '', tag: 'latest' }),
    [config],
  )
  const initialPorts = useMemo<PortMapping[]>(
    () => (config ? config.ports.map((p) => ({ ...p })) : []),
    [config],
  )
  const initialVolumes = useMemo<VolumeMappingWithMode[]>(
    () =>
      config
        ? config.volumes.map((v) => ({
            ...v,
            mode: v.mode ?? 'rw',
          }))
        : [],
    [config],
  )
  const initialEnvVars = useMemo<EnvVar[]>(
    () => (config ? config.envVars.map((e) => ({ ...e })) : []),
    [config],
  )
  const initialResources = useMemo<ResourcesValue>(
    () => ({
      cpus: config?.resources?.cpus ?? '',
      memory: config?.resources?.memory ?? '',
    }),
    [config],
  )

  // ── Form state ─────────────────────────────────────────────────────────────
  const [image, setImage] = useState<ImageValue>(initialImage)
  const [ports, setPorts] = useState<PortMapping[]>(initialPorts)
  const [volumes, setVolumes] = useState<VolumeMappingWithMode[]>(initialVolumes)
  const [envVars, setEnvVars] = useState<EnvVar[]>(initialEnvVars)
  const [resources, setResources] = useState<ResourcesValue>(initialResources)

  // Re-sync form state when the persisted config arrives (or changes between
  // opens). We deliberately key off `config` itself — the memos above already
  // produce fresh references on each new server payload.
  useEffect(() => {
    if (!config) return
    setImage(initialImage)
    setPorts(initialPorts)
    setVolumes(initialVolumes)
    setEnvVars(initialEnvVars)
    setResources(initialResources)
  }, [config, initialImage, initialPorts, initialVolumes, initialEnvVars, initialResources])

  // ── Local error feedback for inline (non-toast) display ────────────────────
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [criticalError, setCriticalError] = useState<string | null>(null)

  // ── Loading / load-error gating ────────────────────────────────────────────
  const isConfigLoading = configQuery.isLoading
  const configLoadError = configQuery.isError
    ? (configQuery.error instanceof Error ? configQuery.error.message : t.containerEdit.loadError)
    : null
  // Disable every input + the save button until we have real config to edit.
  const fieldsDisabled = isConfigLoading || configLoadError !== null

  // ── Diff detection ─────────────────────────────────────────────────────────
  const imageChanged = useMemo(
    () => stableStringify(image) !== stableStringify(initialImage),
    [image, initialImage],
  )
  const portsChanged = useMemo(
    () => stableStringify(ports) !== stableStringify(initialPorts),
    [ports, initialPorts],
  )
  const volumesChanged = useMemo(
    () => stableStringify(volumes) !== stableStringify(initialVolumes),
    [volumes, initialVolumes],
  )
  const envVarsChanged = useMemo(
    () => stableStringify(envVars) !== stableStringify(initialEnvVars),
    [envVars, initialEnvVars],
  )
  // Resources diff against the persisted baseline — so prefilled limits don't
  // count as a change, and clearing a prefilled limit *does*.
  const resourcesChanged = useMemo(
    () =>
      resources.cpus.trim() !== initialResources.cpus.trim() ||
      resources.memory.trim() !== initialResources.memory.trim(),
    [resources, initialResources],
  )
  const hasDiff = imageChanged || portsChanged || volumesChanged || envVarsChanged || resourcesChanged

  // `isLoading` here = "saving in progress" (drives spinner on the button).
  // Field disable state combines that with config-loading / config-error so
  // the user can never edit on top of stale or absent data.
  const isLoading = editMutation.isPending
  const inputsDisabled = isLoading || fieldsDisabled

  // ── Build the EditPayload from the form (only changed fields) ──────────────
  function buildPayload(): EditPayload {
    const payload: EditPayload = {}
    if (imageChanged) payload.dockerImage = joinImageRef(image)
    if (portsChanged) payload.ports = ports
    if (volumesChanged) {
      // Strip empty `mode` so the server uses its default. Keep `mode` only
      // when the user explicitly set ro (the field defaults to rw locally).
      payload.volumes = volumes.map((v) => {
        const out: VolumeMapping = {
          hostPath: v.hostPath,
          containerPath: v.containerPath,
          ...(v.label !== undefined ? { label: v.label } : {}),
          ...(v.mode ? { mode: v.mode } : {}),
        }
        return out
      })
    }
    if (envVarsChanged) payload.envVars = envVars
    if (resourcesChanged) {
      // Only include populated fields — the schema rejects empty strings, and
      // omitting a field server-side means "no limit" (`normalizeResources`
      // collapses it to `undefined`). So clearing a previously-set limit is
      // expressed by sending an object without that key.
      const cpusTrim = resources.cpus.trim()
      const memoryTrim = resources.memory.trim()
      payload.resources = {
        ...(cpusTrim ? { cpus: cpusTrim } : {}),
        ...(memoryTrim ? { memory: memoryTrim } : {}),
      }
    }
    return payload
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hasDiff || isLoading) return
    setErrorMessage(null)
    setCriticalError(null)

    const payload = buildPayload()

    try {
      const response: EditResponse = await editMutation.mutateAsync({
        id: container.id,
        payload,
      })
      handleResponse(response)
    } catch (err) {
      // 4xx/5xx — apiFetch threw with the response body as the error message.
      const raw = err instanceof Error ? err.message : t.common.unknown
      // Try to extract `message` from `{ error, message }` JSON, otherwise
      // surface the raw text.
      let displayMessage = raw
      try {
        const parsed = JSON.parse(raw) as { message?: string; error?: string }
        if (parsed.message) displayMessage = parsed.message
        else if (parsed.error) displayMessage = parsed.error
      } catch {
        // Not JSON — use as is.
      }
      setErrorMessage(displayMessage)
    }
  }

  function handleResponse(response: EditResponse) {
    if (response.ok) {
      if (response.recreated) {
        onSaved(response.container)
        onClose()
      } else {
        // No diff at the service level either — just close with a soft notice.
        setErrorMessage(t.containerEdit.successNoop)
        // Auto-close after a short delay so the user sees the message.
        setTimeout(() => {
          onClose()
        }, 1200)
      }
      return
    }

    // Failure path — keep modal open so the user can retry / inspect.
    if (response.rolledBack) {
      setErrorMessage(`${t.containerEdit.errorRolledBack} ${response.error}`)
    } else {
      setCriticalError(`${t.containerEdit.errorDoubleFail} (${response.error})`)
    }
  }

  function handleCancel() {
    if (isLoading) return
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 shrink-0">
          <div>
            <h2 className="text-gray-900 dark:text-white font-semibold text-lg">
              {t.containerEdit.title}
            </h2>
            <p className="text-gray-500 dark:text-white/40 text-sm font-mono">
              {container.name}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isLoading}
            className="text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 transition-colors p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={t.containerEdit.cancel}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Loading state — centered spinner + label, no fields rendered. */}
            {isConfigLoading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3" role="status" aria-live="polite">
                <span
                  className="inline-block w-8 h-8 border-2 border-gray-400 dark:border-white/30 border-t-indigo-500 rounded-full animate-spin"
                  aria-hidden="true"
                />
                <p className="text-sm text-gray-600 dark:text-white/60">
                  {t.containerEdit.loading}
                </p>
              </div>
            )}

            {/* Load-error banner — shown in lieu of fields. The user can still cancel. */}
            {configLoadError && !isConfigLoading && (
              <div className="bg-red-600/15 border border-red-500/50 rounded-lg px-4 py-3 text-red-700 dark:text-red-300 text-sm font-medium" role="alert">
                <p className="font-semibold mb-1">{t.containerEdit.loadError}</p>
                <p className="text-xs font-normal opacity-80">{configLoadError}</p>
              </div>
            )}

            {/* Form sections — only rendered once we have real config to edit. */}
            {!isConfigLoading && !configLoadError && (
              <>
                {/* Restart warning banner */}
                {hasDiff && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2.5 text-yellow-700 dark:text-yellow-300 text-xs">
                    {t.containerEdit.warning}
                  </div>
                )}

                {/* Image change banner */}
                {imageChanged && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-2.5 text-blue-700 dark:text-blue-300 text-xs">
                    {t.containerEdit.imageWarning}
                  </div>
                )}

                {/* Critical error banner — surfaces above the form so it cannot be missed. */}
                {criticalError && (
                  <div className="bg-red-600/15 border border-red-500/50 rounded-lg px-4 py-3 text-red-700 dark:text-red-300 text-sm font-medium" role="alert">
                    {criticalError}
                  </div>
                )}

                {/* Image */}
                <section>
                  <h3 className="text-gray-600 dark:text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">
                    {t.containerEdit.sectionImage}
                  </h3>
                  <fieldset disabled={inputsDisabled} className="contents">
                    <ImageField
                      value={image}
                      onChange={setImage}
                      idPrefix={`edit-${container.id}-image`}
                    />
                  </fieldset>
                </section>

                {/* Ports */}
                <section>
                  <h3 className="text-gray-600 dark:text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">
                    {t.containerEdit.sectionPorts}
                  </h3>
                  <fieldset disabled={inputsDisabled} className="contents">
                    <PortsField
                      value={ports}
                      onChange={setPorts}
                      allowAddRemove
                      idPrefix={`edit-${container.id}-ports`}
                    />
                  </fieldset>
                </section>

                {/* Volumes */}
                <section>
                  <h3 className="text-gray-600 dark:text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">
                    {t.containerEdit.sectionVolumes}
                  </h3>
                  <fieldset disabled={inputsDisabled} className="contents">
                    <VolumesField<VolumeMappingWithMode>
                      value={volumes}
                      onChange={setVolumes}
                      allowAddRemove
                      showMode
                      idPrefix={`edit-${container.id}-volumes`}
                    />
                  </fieldset>
                </section>

                {/* Env vars */}
                <section>
                  <h3 className="text-gray-600 dark:text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">
                    {t.containerEdit.sectionEnvVars}
                  </h3>
                  <fieldset disabled={inputsDisabled} className="contents">
                    <EnvVarsField
                      value={envVars}
                      onChange={setEnvVars}
                      allowAddRemove
                      idPrefix={`edit-${container.id}-env`}
                    />
                  </fieldset>
                </section>

                {/* Resources */}
                <section>
                  <h3 className="text-gray-600 dark:text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">
                    {t.containerEdit.sectionResources}
                  </h3>
                  <fieldset disabled={inputsDisabled} className="contents">
                    <ResourcesField
                      value={resources}
                      onChange={setResources}
                      cpusPlaceholder={t.containerEdit.cpusPlaceholder}
                      memoryPlaceholder={t.containerEdit.memoryPlaceholder}
                      idPrefix={`edit-${container.id}-resources`}
                    />
                  </fieldset>
                </section>

                {/* Inline non-critical error */}
                {errorMessage && !criticalError && (
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2" role="status">
                    {errorMessage}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-3 shrink-0">
            <span className="text-xs text-gray-400 dark:text-white/30">
              {!fieldsDisabled && !hasDiff && t.containerEdit.noChanges}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isLoading}
                className="px-4 py-2 text-sm text-gray-600 dark:text-white/60 hover:text-gray-700 dark:hover:text-white/80 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t.containerEdit.cancel}
              </button>
              <button
                type="submit"
                disabled={!hasDiff || inputsDisabled}
                className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors inline-flex items-center gap-2"
              >
                {isLoading && (
                  <span
                    className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                    aria-hidden="true"
                  />
                )}
                {isLoading ? t.containerEdit.saving : t.containerEdit.saveAndRestart}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
