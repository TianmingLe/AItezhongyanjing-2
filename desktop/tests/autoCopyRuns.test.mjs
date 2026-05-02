import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-autocopy-test-'))

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
    path.join(repoRoot, 'electron/main/autoCopyRuns.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const { maybeCopyArtifacts } = require(path.join(outDir, 'autoCopyRuns.js'))

test('maybeCopyArtifacts copies most recent matching run with report', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-autocopy-'))
  const defaultRunsRoot = path.join(root, 'mc', 'runs')
  fs.mkdirSync(defaultRunsRoot, { recursive: true })

  const older = path.join(defaultRunsRoot, 'run_old')
  const newer = path.join(defaultRunsRoot, 'run_new')
  fs.mkdirSync(older, { recursive: true })
  fs.mkdirSync(newer, { recursive: true })

  fs.writeFileSync(path.join(older, 'mvp_report.md'), 'old', 'utf-8')
  fs.writeFileSync(path.join(newer, 'mvp_report.md'), 'new', 'utf-8')

  const t0 = Date.now()
  fs.utimesSync(older, new Date(t0 - 60_000), new Date(t0 - 60_000))
  fs.utimesSync(newer, new Date(t0 - 2_000), new Date(t0 - 2_000))

  const runDir = path.join(root, 'exports', 'runs', 'my_run')
  fs.mkdirSync(runDir, { recursive: true })

  const res = await maybeCopyArtifacts({
    runDir,
    startedAtMs: t0 - 10_000,
    finishedAtMs: t0,
    defaultRunsRoot,
  })

  assert.equal(res.ok, true)
  assert.equal(fs.readFileSync(path.join(runDir, 'mvp_report.md'), 'utf-8'), 'new')
})
