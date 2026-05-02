import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-preload-test-'))

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
    path.join(repoRoot, 'electron/shared/runs.ts'),
    path.join(repoRoot, 'electron/shared/export.ts'),
    path.join(repoRoot, 'electron/shared/task.ts'),
    path.join(repoRoot, 'electron/preload/validators.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const validators = require(path.join(outDir, 'preload/validators.js'))

test('parseStartTaskConfig rejects unknown fields', () => {
  const v = { args: [], foo: 1 }
  assert.equal(validators.parseStartTaskConfig(v), null)
})

test('parseWsInfo rejects unknown fields', () => {
  const v = { wsUrl: 'ws://127.0.0.1:1/', token: 't', extra: 1 }
  assert.equal(validators.parseWsInfo(v), null)
})

test('parseStartStopResult validates ok + optional error', () => {
  assert.deepEqual(validators.parseStartStopResult({ ok: true }), { ok: true })
  assert.deepEqual(validators.parseStartStopResult({ ok: false, error: 'x' }), { ok: false, error: 'x' })
  assert.equal(validators.parseStartStopResult({ ok: false, error: 1 }), null)
})

test('parseListRunsResult rejects unknown fields', () => {
  const v = { ok: true, items: [], extra: 1 }
  assert.equal(validators.parseListRunsResult(v), null)
})

test('parseExportResult validates ok/path', () => {
  assert.deepEqual(validators.parseExportResult({ ok: true, path: '/tmp/a.md' }), { ok: true, path: '/tmp/a.md' })
  assert.equal(validators.parseExportResult({ ok: true, path: 1 }), null)
})

test('parseStartWithRunResult rejects unknown fields', () => {
  const v = { ok: true, runId: 'r', runDir: '/tmp', extra: 1 }
  assert.equal(validators.parseStartWithRunResult(v), null)
})
