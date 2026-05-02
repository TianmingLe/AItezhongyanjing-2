import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-output-support-test-'))

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
    path.join(repoRoot, 'electron/main/outputDirSupport.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const { supportsOutputDirArgFromHelp } = require(path.join(outDir, 'outputDirSupport.js'))

test('supportsOutputDirArgFromHelp detects --output-dir', () => {
  assert.equal(supportsOutputDirArgFromHelp('Usage:\n  --output-dir <path>\n'), true)
  assert.equal(supportsOutputDirArgFromHelp('Usage:\n  --foo bar\n'), false)
})
