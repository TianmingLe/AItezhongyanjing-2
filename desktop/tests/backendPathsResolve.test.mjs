import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-backend-paths-test-'))

execFileSync(
  process.execPath,
  [
    path.join(repoRoot, 'node_modules/typescript/bin/tsc'),
    '--outDir',
    outDir,
    '--target',
    'ES2022',
    '--module',
    'commonjs',
    path.join(repoRoot, 'electron/main/backendPaths.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const { resolveBackend } = require(path.join(outDir, 'backendPaths.js'))

test('resolveBackend returns python mode in dev', () => {
  const res = resolveBackend({ isPackaged: false, resourcesPath: '/r', appRoot: '/app', env: { MEDIA_CRAWLER_ENTRY: '/x.py' } })
  assert.equal(res.mode, 'python')
  assert.equal(res.entryPath, '/x.py')
})

test('resolveBackend returns exe mode in packaged', () => {
  const res = resolveBackend({ isPackaged: true, resourcesPath: '/r', appRoot: '/app', env: {} })
  assert.equal(res.mode, 'exe')
  assert.ok(res.execPath.includes('/r/python/'))
})
