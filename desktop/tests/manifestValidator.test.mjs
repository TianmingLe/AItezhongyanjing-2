import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const run = (manifestPath) => {
  const res = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts', 'validate-manifest.js'), manifestPath], {
    encoding: 'utf-8',
  })
  return { code: res.status ?? 0, out: `${res.stdout || ''}\n${res.stderr || ''}` }
}

test('validate-manifest passes example manifest', () => {
  const { code, out } = run(path.join(process.cwd(), 'resources-manifest.json'))
  assert.equal(code, 0, out)
})

test('validate-manifest rejects path traversal', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'))
  const p = path.join(dir, 'bad.json')
  fs.writeFileSync(
    p,
    JSON.stringify(
      {
        version: '1.0.0',
        resources: [
          { name: 'x', url: 'https://example.com/x', sha256: 'a'.repeat(64), dest: '../../etc/passwd', size_mb: 1 },
        ],
      },
      null,
      2,
    ),
    'utf-8',
  )
  const { code } = run(p)
  assert.notEqual(code, 0)
})

test('validate-manifest rejects bad sha256 length', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'))
  const p = path.join(dir, 'badsha.json')
  fs.writeFileSync(
    p,
    JSON.stringify(
      {
        version: '1.0.0',
        resources: [{ name: 'x', url: 'https://example.com/x', sha256: 'abcd', dest: 'resources/models/a', size_mb: 1 }],
      },
      null,
      2,
    ),
    'utf-8',
  )
  const { code } = run(p)
  assert.notEqual(code, 0)
})

