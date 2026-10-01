import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { findProjectRoot } from '../src/lib/project-root.js'

test('independent review: update and storage modules resolve actual tsc production layout', () => {
  const root = findProjectRoot(import.meta.url)
  for (const file of ['apps/backend/src/services/updates.service.ts', 'apps/backend/src/routes/storage/index.ts', 'apps/backend/dist/apps/backend/src/services/updates.service.js', 'apps/backend/dist/apps/backend/src/routes/storage/index.js']) {
    const path = join(root, file)
    assert.equal(findProjectRoot(pathToFileURL(path).href), root, file)
  }
})
