import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import * as Module from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-ws-test-'))

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
    path.join(repoRoot, 'electron/main/logServer.ts'),
  ],
  { stdio: 'inherit' },
)

process.env.NODE_PATH = path.join(repoRoot, 'node_modules')
Module.Module._initPaths()

const require = createRequire(import.meta.url)
const { startLogServer } = require(path.join(outDir, 'main/logServer.js'))
const { WebSocket } = require('ws')

const waitFor = async (fn, timeoutMs = 2000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const v = fn()
    if (v) return v
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('timeout')
}

test('rejects invalid token', async () => {
  const s = await startLogServer({ backlogMax: 10 })
  const bad = new WebSocket(`${s.wsUrl}?token=bad`)
  let done = false
  const mark = () => {
    done = true
  }
  bad.on('close', mark)
  bad.on('error', mark)
  bad.on('unexpected-response', mark)
  await waitFor(() => done, 2000)
  await s.close()
})

test('sends init backlog on connect and broadcasts new events', async () => {
  const s = await startLogServer({ backlogMax: 3 })
  s.broadcast({ type: 'log', level: 'INFO', timestamp: Date.now(), message: 'a', stream: 'stdout' })
  s.broadcast({ type: 'log', level: 'INFO', timestamp: Date.now(), message: 'b', stream: 'stdout' })

  const url = `${s.wsUrl}?token=${s.token}`
  const ws = new WebSocket(url)

  const msgs = []
  ws.on('message', (buf) => {
    msgs.push(JSON.parse(String(buf)))
  })

  await waitFor(() => msgs.find((m) => m.type === 'init'), 2000)
  const init = msgs.find((m) => m.type === 'init')
  assert.equal(Array.isArray(init.backlog), true)
  assert.equal(init.backlog.length, 2)

  s.broadcast({ type: 'status', status: 'running', timestamp: Date.now(), detail: 'ok' })
  await waitFor(() => msgs.find((m) => m.type === 'status'), 2000)

  ws.close()
  await s.close()
})

test('backlog is capped to max size', async () => {
  const s = await startLogServer({ backlogMax: 3 })
  s.broadcast({ type: 'log', level: 'INFO', timestamp: Date.now(), message: '1', stream: 'stdout' })
  s.broadcast({ type: 'log', level: 'INFO', timestamp: Date.now(), message: '2', stream: 'stdout' })
  s.broadcast({ type: 'log', level: 'INFO', timestamp: Date.now(), message: '3', stream: 'stdout' })
  s.broadcast({ type: 'log', level: 'INFO', timestamp: Date.now(), message: '4', stream: 'stdout' })

  const ws = new WebSocket(`${s.wsUrl}?token=${s.token}`)
  const msgs = []
  ws.on('message', (buf) => msgs.push(JSON.parse(String(buf))))
  await waitFor(() => msgs.find((m) => m.type === 'init'), 2000)
  const init = msgs.find((m) => m.type === 'init')
  assert.equal(init.backlog.length, 3)
  assert.equal(init.backlog[0].message, '2')
  assert.equal(init.backlog[2].message, '4')

  ws.close()
  await s.close()
})
