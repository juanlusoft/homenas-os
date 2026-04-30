/**
 * Reusable container form fields.
 *
 * These components are used by the install wizard in `HomeStoreView` and
 * are intended to be reused by `ContainerEditModal` (work in progress).
 *
 * All fields share the same prop convention:
 *   - `value: T`
 *   - `onChange: (next: T) => void`
 *   - `error?: string` — rendered as a red helper message and reflected via
 *     `aria-invalid` on inputs. Validation logic lives in the parent.
 */

export { ImageField } from './ImageField'
export type { ImageFieldProps } from './ImageField'

export { PortsField } from './PortsField'
export type { PortsFieldProps } from './PortsField'

export { VolumesField } from './VolumesField'
export type { VolumesFieldProps } from './VolumesField'

export { EnvVarsField } from './EnvVarsField'
export type { EnvVarsFieldProps } from './EnvVarsField'

export { ResourcesField } from './ResourcesField'
export type { ResourcesFieldProps } from './ResourcesField'

export { ContainerEditModal } from './ContainerEditModal'
export type { ContainerEditModalProps } from './ContainerEditModal'

export type {
  PortMapping,
  VolumeMapping,
  VolumeMappingWithMode,
  VolumeMode,
  EnvVar,
  ImageValue,
  ResourcesValue,
} from './types'
