import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-pm-test-'))

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
    path.join(repoRoot, 'electron/main/processManager.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const { ProcessManager } = require(path.join(outDir, 'main/processManager.js'))

const writeTmpPy = (code) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-pm-py-'))
  const fp = path.join(dir, 'script.py')
  fs.writeFileSync(fp, code, 'utf-8')
  return fp
}

const waitFor = async (fn, timeoutMs = 2000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const v = fn()
    if (v) return v
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('timeout')
}

test('startTask spawns and parses stdout', async () => {
  const script = writeTmpPy(`
import signal, sys, time
def on_term(_sig, _frame):
  print("[SUCCESS] [pm] terminated", flush=True)
  sys.exit(0)
signal.signal(signal.SIGTERM, on_term)
print("[INFO] [pm] hello", flush=True)
time.sleep(60)
`)

  const pm = new ProcessManager({ pythonExecPath: 'python3', entryPath: script })
  const events = []
  const off = pm.onEvent((e) => events.push(e))

  const res = await pm.startTask({ args: [] })
  assert.equal(res.ok, true)
  assert.equal(pm.getStatus(), 'running')

  await waitFor(() => events.find((e) => e.type === 'log' && e.level === 'INFO'))
  const log = events.find((e) => e.type === 'log' && e.level === 'INFO')
  assert.equal(log.module, 'pm')
  assert.equal(log.message, 'hello')

  await pm.stopTask()
  await waitFor(() => pm.getStatus() === 'idle', 5000)
  off()
})

test('stopTask sends SIGTERM then ends cleanly', async () => {
  const script = writeTmpPy(`
import signal, sys, time
def on_term(_sig, _frame):
  print("[SUCCESS] [pm] terminated", flush=True)
  sys.exit(0)
signal.signal(signal.SIGTERM, on_term)
print("[PROGRESS] [pm] running", flush=True)
time.sleep(60)
`)

  const pm = new ProcessManager({ pythonExecPath: 'python3', entryPath: script })
  const events = []
  pm.onEvent((e) => events.push(e))

  const res = await pm.startTask({ args: [] })
  assert.equal(res.ok, true)

  await waitFor(() => events.find((e) => e.type === 'log' && e.level === 'PROGRESS'))
  await pm.stopTask()

  await waitFor(() => events.find((e) => e.type === 'log' && e.level === 'SUCCESS'), 5000)
  await waitFor(() => pm.getStatus() === 'idle', 5000)
})

test('startTask rejects when already running', async () => {
  const script = writeTmpPy(`
import time
print("[INFO] started", flush=True)
time.sleep(60)
`)

  const pm = new ProcessManager({ pythonExecPath: 'python3', entryPath: script })
  const res1 = await pm.startTask({ args: [] })
  assert.equal(res1.ok, true)
  const res2 = await pm.startTask({ args: [] })
  assert.equal(res2.ok, false)
  assert.equal(res2.error, 'process_already_running')
  await pm.stopTask()
  await waitFor(() => pm.getStatus() === 'idle', 5000)
})

test('startTask rejects dangerous env overrides', async () => {
  const script = writeTmpPy(`
print("[INFO] hi", flush=True)
`)

  const pm = new ProcessManager({ pythonExecPath: 'python3', entryPath: script })
  const res = await pm.startTask({ args: [], env: { PATH: '/tmp' } })
  assert.equal(res.ok, false)
  assert.equal(res.error, 'dangerous_env_override')
  assert.equal(pm.getStatus(), 'idle')
})

test('abnormal exit emits idle with exit detail', async () => {
  const script = writeTmpPy(`
import sys
print("[ERROR] [pm] boom", file=sys.stderr, flush=True)
sys.exit(2)
`)

  const pm = new ProcessManager({ pythonExecPath: 'python3', entryPath: script })
  const events = []
  pm.onEvent((e) => events.push(e))
  const res = await pm.startTask({ args: [] })
  assert.equal(res.ok, true)

  await waitFor(() => pm.getStatus() === 'idle', 5000)
  const err = events.find((e) => e.type === 'log' && e.stream === 'stderr')
  assert.equal(err.level, 'ERROR')
})
