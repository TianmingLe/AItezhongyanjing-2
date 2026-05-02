import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-resources-validators-test-'))

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
    path.join(repoRoot, 'electron/shared/resources.ts'),
    path.join(repoRoot, 'electron/preload/validators.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const validators = require(path.join(outDir, 'preload/validators.js'))
const shared = require(path.join(outDir, 'shared/resources.js'))

test('parseEnsureResourcesResult validates ok and rejects unknown fields', () => {
  assert.deepEqual(validators.parseEnsureResourcesResult({ ok: true }), { ok: true })
  assert.equal(validators.parseEnsureResourcesResult({ ok: true, extra: 1 }), null)
})

test('parseResourceProgressEvent validates shape', () => {
  assert.deepEqual(
    validators.parseResourceProgressEvent({ type: 'resources', phase: 'downloading', percent: 10, message: 'x' }),
    { type: 'resources', phase: 'downloading', percent: 10, message: 'x' },
  )
  assert.equal(validators.parseResourceProgressEvent({ type: 'resources', phase: 'oops' }), null)
})

test('isManifestSchema validates shape and sha256', () => {
  assert.equal(
    shared.isManifestSchema({
      version: '1.0.0',
      resources: [{ name: 'x', url: 'https://example.com', sha256: 'a'.repeat(64), dest: 'resources/models/a', size_mb: 1 }],
    }),
    true,
  )
  assert.equal(
    shared.isManifestSchema({
      version: '1.0.0',
      resources: [{ name: 'x', url: 'https://example.com', sha256: 'abcd', dest: 'resources/models/a' }],
    }),
    false,
  )
})
