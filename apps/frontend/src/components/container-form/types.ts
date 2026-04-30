/**
 * Shared types for the reusable container form fields.
 *
 * Whenever possible we re-export the canonical types from `@homenas/shared`.
 * Extra types (e.g. volume mode, resources) are defined here because the
 * shared schemas don't model them yet — they will be promoted to schemas
 * once a server-side container edit endpoint exists.
 */

import type { PortMapping, VolumeMapping, EnvVar } from '@homenas/shared'

// ─── Re-exports of shared types ─────────────────────────────────────────────

export type { PortMapping, VolumeMapping, EnvVar }

// ─── Volume mode (rw/ro) ────────────────────────────────────────────────────
//
// `VolumeMapping` from @homenas/shared currently has no `mode` field. The
// `VolumesField` component accepts an extended row that adds an optional
// `mode` so it can be reused by ContainerEditModal without breaking the
// install wizard (which omits `mode`).

export type VolumeMode = 'rw' | 'ro'

export interface VolumeMappingWithMode extends VolumeMapping {
  mode?: VolumeMode
}

// ─── Image / tag ────────────────────────────────────────────────────────────

export interface ImageValue {
  /** Image name without tag, e.g. "linuxserver/jellyfin". */
  image: string
  /** Tag, e.g. "latest" or "v1.2.3". */
  tag: string
}

// ─── Resources (cpus / memory) ──────────────────────────────────────────────
//
// Free-form strings that mirror docker's CLI flags:
//   --cpus="0.5" / "2"
//   --memory="256m" / "1g"
// Empty string means "unset".

export interface ResourcesValue {
  cpus: string
  memory: string
}
