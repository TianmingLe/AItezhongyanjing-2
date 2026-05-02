import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-cli-parse-test-'))

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
    path.join(repoRoot, 'src/utils/argsBuilder.ts'),
    path.join(repoRoot, 'src/utils/cliArgsParse.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const { parseCliArgsToForm, defaultTaskFormState } = require(path.join(outDir, 'cliArgsParse.js'))

test('parseCliArgsToForm fills detail mode fields', () => {
  const form = parseCliArgsToForm(['--platform', 'xhs', '--pipeline', 'mvp', '--specified_id', '123'], defaultTaskFormState())
  assert.equal(form.platform, 'xhs')
  assert.equal(form.mode, 'detail')
  assert.equal(form.specified_id, '123')
})

test('parseCliArgsToForm fills search mode fields', () => {
  const form = parseCliArgsToForm(['--platform', 'bili', '--pipeline', 'mvp', '--keyword', 'k', '--limit', '50'], defaultTaskFormState())
  assert.equal(form.platform, 'bili')
  assert.equal(form.mode, 'search')
  assert.equal(form.keyword, 'k')
  assert.equal(form.limit, 50)
})
