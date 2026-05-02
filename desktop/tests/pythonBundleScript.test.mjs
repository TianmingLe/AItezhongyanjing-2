import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('python bundle script exists', () => {
  assert.equal(fs.existsSync(path.join(process.cwd(), 'scripts', 'build_python_bundle.py')), true)
})

