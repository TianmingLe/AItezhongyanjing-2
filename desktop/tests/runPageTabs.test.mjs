import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-runpage-tabs-test-'))

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
    path.join(repoRoot, 'electron/shared/protocol.ts'),
    path.join(repoRoot, 'src/utils/runPageTabs.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const { nextActiveTab, shouldLoadReport } = require(path.join(outDir, 'src/utils/runPageTabs.js'))

test('nextActiveTab switches to report on stopped', () => {
  assert.equal(nextActiveTab('terminal', 'stopped'), 'report')
  assert.equal(nextActiveTab('terminal', 'running'), 'terminal')
})

test('shouldLoadReport loads once when stopped + runId present', () => {
  assert.equal(shouldLoadReport({ status: 'stopped', runId: 'r', hasReport: false, loading: false }), true)
  assert.equal(shouldLoadReport({ status: 'stopped', runId: '', hasReport: false, loading: false }), false)
  assert.equal(shouldLoadReport({ status: 'stopped', runId: 'r', hasReport: true, loading: false }), false)
  assert.equal(shouldLoadReport({ status: 'stopped', runId: 'r', hasReport: false, loading: true }), false)
})
