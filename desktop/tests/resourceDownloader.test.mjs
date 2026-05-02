import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-resource-downloader-test-'))

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
    path.join(repoRoot, 'electron/main/resourceDownloader.ts'),
    path.join(repoRoot, 'electron/main/resourceLock.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const { setupResources } = require(path.join(outDir, 'main/resourceDownloader.js'))

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

test('setupResources downloads file, verifies, and writes .ready', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'))
  const data = Buffer.from('hello-world')
  const urlPath = '/file.bin'

  const srv = http.createServer((req, res) => {
    if (req.url === urlPath) {
      res.statusCode = 200
      res.setHeader('content-length', String(data.length))
      res.end(data)
      return
    }
    res.statusCode = 404
    res.end('not found')
  })
  await new Promise((r) => srv.listen(0, r))
  const port = srv.address().port
  const url = `http://127.0.0.1:${port}${urlPath}`

  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'approot-'))
  const manifest = {
    version: '1.0.0',
    resources: [
      {
        name: 't1',
        url,
        sha256: sha256(data),
        dest: 'resources/models/t1',
        size_mb: 1,
      },
    ],
  }
  const manifestPath = path.join(appRoot, 'resources-manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

  const events = []
  await setupResources({
    appRoot,
    homeDir: home,
    manifestPath,
    onProgress: (ev) => events.push(ev),
  })

  const outFile = path.join(home, 'OmniScraperExports', 'resources', 'models', 't1', 'file.bin')
  assert.equal(fs.readFileSync(outFile, 'utf-8'), 'hello-world')
  assert.equal(fs.existsSync(path.join(home, 'OmniScraperExports', 'resources', 'models', 't1', '.ready')), true)
  assert.equal(events.some((e) => e.resourceName === 't1' && e.phase === 'downloading'), true)

  srv.close()
})

test('setupResources retries on sha mismatch and succeeds', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'))
  const good = Buffer.from('good')
  const bad = Buffer.from('bad')
  let n = 0

  const srv = http.createServer((req, res) => {
    if (req.url === '/x') {
      const payload = n++ === 0 ? bad : good
      res.statusCode = 200
      res.setHeader('content-length', String(payload.length))
      res.end(payload)
      return
    }
    res.statusCode = 404
    res.end('not found')
  })
  await new Promise((r) => srv.listen(0, r))
  const port = srv.address().port
  const url = `http://127.0.0.1:${port}/x`

  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'approot-'))
  const manifest = { version: '1.0.0', resources: [{ name: 't2', url, sha256: sha256(good), dest: 'resources/models/t2' }] }
  const manifestPath = path.join(appRoot, 'resources-manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

  await setupResources({ appRoot, homeDir: home, manifestPath, onProgress: () => undefined })

  const outFile = path.join(home, 'OmniScraperExports', 'resources', 'models', 't2', 'x')
  assert.equal(fs.readFileSync(outFile, 'utf-8'), 'good')
  srv.close()
})
