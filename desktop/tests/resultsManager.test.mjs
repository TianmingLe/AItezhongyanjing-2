import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-results-test-'))

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
    path.join(repoRoot, 'electron/shared/runs.ts'),
    path.join(repoRoot, 'electron/main/resultsManager.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const { createResultsManager } = require(path.join(outDir, 'main/resultsManager.js'))

test('getResultsRoot creates runs/ and exports/', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-home-'))
  const rm = createResultsManager({ homeDir, overrideResultsRoot: path.join(homeDir, 'CustomRoot') })
  const res = await rm.getResultsRoot()
  assert.equal(res.ok, true)
  assert.equal(fs.existsSync(path.join(res.path, 'runs')), true)
  assert.equal(fs.existsSync(path.join(res.path, 'exports')), true)
})

test('listRuns reads meta.json and falls back when missing', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-home-'))
  const root = path.join(homeDir, 'Root')
  const rm = createResultsManager({ homeDir, overrideResultsRoot: root })
  await rm.getResultsRoot()

  const r1 = path.join(root, 'runs', '20260502_000001_dy_detail_aaaaaa')
  const r2 = path.join(root, 'runs', '20260502_000002_xhs_search_bbbbbb')
  fs.mkdirSync(r1, { recursive: true })
  fs.mkdirSync(r2, { recursive: true })

  fs.writeFileSync(
    path.join(r2, 'meta.json'),
    JSON.stringify({ run_id: path.basename(r2), created_at_ms: Date.now() + 10_000, status: 'success', platform: 'xhs' }),
    'utf-8',
  )

  const out = await rm.listRuns()
  assert.equal(out.ok, true)
  assert.equal(out.items.length, 2)
  assert.equal(out.items[0].run_id, path.basename(r2))
  assert.equal(out.items[0].status, 'success')
  assert.equal(out.items[1].run_id, path.basename(r1))
  assert.equal(out.items[1].status, 'unknown')
})

test('readRunReport rejects path traversal', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-home-'))
  const rm = createResultsManager({ homeDir })
  const out = await rm.readRunReport('../../etc/passwd')
  assert.equal(out.ok, false)
  assert.equal(out.error, 'bad_run_id')
})
