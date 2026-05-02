import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const files = fs
  .readdirSync(root)
  .filter((f) => f.startsWith('resources-manifest') && f.endsWith('.json'))
  .sort()

if (files.length === 0) {
  process.stderr.write('no manifests found\n')
  process.exit(1)
}

let ok = true
for (const f of files) {
  const res = spawnSync(process.execPath, [path.join(root, 'scripts', 'validate-manifest.js'), f], { encoding: 'utf-8' })
  if ((res.status ?? 0) !== 0) {
    ok = false
    process.stderr.write(`${f} FAIL\n`)
    process.stderr.write(`${res.stdout || ''}${res.stderr || ''}\n`)
  } else {
    process.stdout.write(`${f} ok\n`)
  }
}

process.exit(ok ? 0 : 1)

