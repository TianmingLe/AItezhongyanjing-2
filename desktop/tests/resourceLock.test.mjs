import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-resource-lock-test-'))

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
    path.join(repoRoot, 'electron/main/resourceLock.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const { acquireResourceLock } = require(path.join(outDir, 'resourceLock.js'))

test('acquireResourceLock rejects non-stale lock', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locktest-'))
  const lockPath = path.join(dir, '.download.lock')
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 1, timestamp: Date.now() }), 'utf-8')
  await assert.rejects(() => acquireResourceLock(lockPath, { staleMs: 30 * 60 * 1000 }))
})

test('acquireResourceLock overwrites stale lock and releases', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locktest-'))
  const lockPath = path.join(dir, '.download.lock')
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 1, timestamp: Date.now() - 31 * 60 * 1000 }), 'utf-8')
  const release = await acquireResourceLock(lockPath, { staleMs: 30 * 60 * 1000 })
  assert.equal(fs.existsSync(lockPath), true)
  await release()
  assert.equal(fs.existsSync(lockPath), false)
})

