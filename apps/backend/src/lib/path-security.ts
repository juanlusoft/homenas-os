import { realpathSync } from 'node:fs'
import { basename, dirname, join, normalize } from 'node:path'

/** Resolve existing ancestors as well as missing leaves before privileged writes/mounts. */
export function assertContainedHostPath(input: string, roots: readonly string[]): string {
  if (!input.startsWith('/') || input.includes('\0')) throw new Error('Invalid absolute host path')
  const contained = (value: string) => roots.some(root => value === root.replace(/\/$/, '') || value.startsWith(`${root.replace(/\/$/, '')}/`))
  const normalized = normalize(input)
  if (!contained(normalized)) throw new Error('Host path is outside allowed roots')
  let ancestor = normalized
  const missing: string[] = []
  while (true) {
    try {
      const resolved = join(realpathSync(ancestor), ...missing.reverse())
      if (!contained(resolved)) throw new Error('Host path escapes allowed roots via symlink')
      return resolved
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      const parent = dirname(ancestor)
      if (parent === ancestor) throw err
      missing.push(basename(ancestor))
      ancestor = parent
    }
  }
}
