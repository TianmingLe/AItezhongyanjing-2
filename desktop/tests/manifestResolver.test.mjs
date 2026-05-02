import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-manifest-resolver-test-'))

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
    path.join(repoRoot, 'scripts/resolve-manifest-path.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const { resolveManifestPath } = require(path.join(outDir, 'resolve-manifest-path.js'))

test('resolveManifestPath prefers OMNI_MANIFEST_PATH', () => {
  const p = resolveManifestPath({
    appRoot: '/app',
    platform: 'win',
    arch: 'x64',
    env: { OMNI_MANIFEST_PATH: '/x/custom.json' },
  })
  assert.equal(p, '/x/custom.json')
})

test('resolveManifestPath picks platform/arch manifest when present', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-'))
  const f = path.join(dir, 'resources-manifest.win.x64.json')
  fs.writeFileSync(f, '{"version":"1.0.0","resources":[]}', 'utf-8')
  const p = resolveManifestPath({ appRoot: dir, platform: 'win', arch: 'x64', env: {} })
  assert.equal(p, f)
})

test('resolveManifestPath falls back to resources-manifest.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-'))
  const f = path.join(dir, 'resources-manifest.json')
  fs.writeFileSync(f, '{"version":"1.0.0","resources":[]}', 'utf-8')
  const p = resolveManifestPath({ appRoot: dir, platform: 'darwin', arch: 'arm64', env: {} })
  assert.equal(p, f)
})

