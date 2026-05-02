import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-run-registry-test-'))

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
    path.join(repoRoot, 'electron/main/runRegistry.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const { createRunRegistry } = require(path.join(outDir, 'main/runRegistry.js'))

test('createRun writes meta.json immediately and finalize updates status', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-home-'))
  const resultsRoot = path.join(homeDir, 'OmniScraperExports')
  const runsRoot = path.join(resultsRoot, 'runs')
  fs.mkdirSync(runsRoot, { recursive: true })

  const rr = createRunRegistry({ runsRoot })
  const created = await rr.createRun({
    platform: 'dy',
    mode: 'detail',
    cli_args: ['--platform', 'dy', '--pipeline', 'mvp', '--specified_id', '123'],
  })

  assert.ok(created.runId)
  assert.ok(created.runDir.endsWith(created.runId))
  const metaPath = path.join(created.runDir, 'meta.json')
  assert.equal(fs.existsSync(metaPath), true)

  const meta1 = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  assert.equal(meta1.status, 'running')
  assert.equal(meta1.platform, 'dy')

  await rr.finalizeRun(created.runId, { status: 'success' })
  const meta2 = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  assert.equal(meta2.status, 'success')
  assert.ok(typeof meta2.finished_at_ms === 'number')
})

