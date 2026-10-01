import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Locate the monorepo in both source and compiled backend layouts. */
export function findProjectRoot(moduleUrl: string): string {
  let directory = dirname(fileURLToPath(moduleUrl))
  while (true) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { name?: string }
      if (manifest.name === 'homenas-os-v3') return directory
    } catch { /* keep walking */ }
    const parent = dirname(directory)
    if (parent === directory) throw new Error('Cannot locate HomeNas repository root')
    directory = parent
  }
}
