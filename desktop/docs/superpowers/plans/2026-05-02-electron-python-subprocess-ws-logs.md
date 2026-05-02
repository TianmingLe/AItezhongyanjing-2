# Electron Python Subprocess + WebSocket Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Note: do not modify any files under `/workspace/MediaCrawler`. This plan only reads/executes it via subprocess.

**Goal:** From Electron Main process, safely spawn `/workspace/MediaCrawler/main.py`, parse stdout/stderr into structured events, and stream them to Renderer via local authenticated WebSocket with IPC fallback.

**Architecture:** Main owns a single `ProcessManager` and a single `LogServer`. Renderer connects to WS (dynamic port + token) and renders logs; preload exposes a minimal, type-checked API surface.

**Tech Stack:** Electron, electron-vite, React, TypeScript, Node `child_process.spawn`, `ws`, `readline`.

---

## File Map

**Create**
- `/workspace/desktop/electron/main/processManager.ts`
- `/workspace/desktop/electron/main/logServer.ts`
- `/workspace/desktop/electron/shared/protocol.ts`

**Modify**
- `/workspace/desktop/electron/main/index.ts`
- `/workspace/desktop/electron/preload/index.ts`
- `/workspace/desktop/electron/preload/index.d.ts`
- `/workspace/desktop/electron.vite.config.ts`
- `/workspace/desktop/package.json`
- `/workspace/desktop/src/App.tsx`

## Task 1: Add WS dependency

**Files**
- Modify: `/workspace/desktop/package.json`

- [ ] **Step 1: Add dependency**

Run:

```bash
cd /workspace/desktop
npm install ws
```

Expected: install succeeds. (If Electron download is flaky in the sandbox, keep existing local workaround; do not change MediaCrawler.)

- [ ] **Step 2: Verify dependency exists**

Run:

```bash
cd /workspace/desktop
node -e "console.log(require('ws') ? 'ws-ok' : 'ws-missing')"
```

Expected: prints `ws-ok`.

## Task 2: Define protocol types + runtime type guards

**Files**
- Create: `/workspace/desktop/electron/shared/protocol.ts`

- [ ] **Step 1: Create protocol + guards**

Create:

```ts
// /workspace/desktop/electron/shared/protocol.ts
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'PROGRESS' | 'RAW'

export type LogEvent = {
  type: 'log'
  seq: number
  level: LogLevel
  timestamp: number
  module?: string
  message: string
  stream: 'stdout' | 'stderr'
}

export type StatusEvent = {
  type: 'status'
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
  timestamp: number
  detail?: string
}

export type InitEvent = {
  type: 'init'
  now: number
  backlog: LogEvent[]
}

export type EventEnvelope = LogEvent | StatusEvent | InitEvent

export type StartTaskConfig = {
  args: string[]
  cwd?: string
  env?: Record<string, string>
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const isLogLevel = (v: unknown): v is LogLevel =>
  v === 'INFO' || v === 'WARN' || v === 'ERROR' || v === 'SUCCESS' || v === 'PROGRESS' || v === 'RAW'

export const isLogEvent = (v: unknown): v is LogEvent => {
  if (!isRecord(v)) return false
  if (v.type !== 'log') return false
  if (!isNumber(v.seq)) return false
  if (!isLogLevel(v.level)) return false
  if (!isNumber(v.timestamp)) return false
  if (!isString(v.message)) return false
  if (v.module !== undefined && !isString(v.module)) return false
  if (v.stream !== 'stdout' && v.stream !== 'stderr') return false
  return true
}

export const isStatusEvent = (v: unknown): v is StatusEvent => {
  if (!isRecord(v)) return false
  if (v.type !== 'status') return false
  if (v.status !== 'starting' && v.status !== 'running' && v.status !== 'stopping' && v.status !== 'stopped' && v.status !== 'error') {
    return false
  }
  if (!isNumber(v.timestamp)) return false
  if (v.detail !== undefined && !isString(v.detail)) return false
  return true
}

export const isInitEvent = (v: unknown): v is InitEvent => {
  if (!isRecord(v)) return false
  if (v.type !== 'init') return false
  if (!isNumber(v.now)) return false
  if (!Array.isArray(v.backlog)) return false
  return v.backlog.every(isLogEvent)
}

export const isEventEnvelope = (v: unknown): v is EventEnvelope => isLogEvent(v) || isStatusEvent(v) || isInitEvent(v)

export const isStartTaskConfig = (v: unknown): v is StartTaskConfig => {
  if (!isRecord(v)) return false
  if (!Array.isArray(v.args) || !v.args.every(isString)) return false
  if (v.cwd !== undefined && !isString(v.cwd)) return false
  if (v.env !== undefined) {
    if (!isRecord(v.env)) return false
    for (const val of Object.values(v.env)) {
      if (!isString(val)) return false
    }
  }
  return true
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
cd /workspace/desktop
npx tsc -p tsconfig.json --noEmit
```

Expected: no TypeScript errors.

## Task 3: Implement LogServer (dynamic port + token + backlog + broadcast)

**Files**
- Create: `/workspace/desktop/electron/main/logServer.ts`
- Modify: `/workspace/desktop/electron.vite.config.ts`

- [ ] **Step 1: Add `@shared` alias for renderer**

Modify `electron.vite.config.ts` renderer resolve alias to include:

```ts
resolve: {
  alias: {
    '@': path.resolve(__dirname, 'src'),
    '@shared': path.resolve(__dirname, 'electron/shared'),
  },
},
```

Run:

```bash
cd /workspace/desktop
npx tsc -p tsconfig.json --noEmit
```

Expected: no TS errors.

- [ ] **Step 2: Create LogServer**

Create:

```ts
// /workspace/desktop/electron/main/logServer.ts
import crypto from 'node:crypto'
import http from 'node:http'
import { WebSocketServer } from 'ws'

import type { InitEvent, LogEvent } from '../shared/protocol'

type Client = {
  ws: import('ws').WebSocket
  alive: boolean
}

export type LogServerHandle = {
  wsUrl: string
  token: string
  broadcast: (ev: LogEvent) => void
  close: () => Promise<void>
  snapshotBacklog: () => LogEvent[]
}

const parseToken = (url: string | undefined): string | null => {
  if (!url) return null
  try {
    const u = new URL(url, 'http://localhost')
    return u.searchParams.get('token')
  } catch {
    return null
  }
}

export const startLogServer = (opts?: { backlogMax?: number }): Promise<LogServerHandle> => {
  const backlogMax = Math.max(1, opts?.backlogMax ?? 1000)
  const token = crypto.randomBytes(24).toString('hex')
  const backlog: LogEvent[] = []
  const clients = new Set<Client>()

  const pushBacklog = (ev: LogEvent) => {
    backlog.push(ev)
    if (backlog.length > backlogMax) backlog.splice(0, backlog.length - backlogMax)
  }

  const server = http.createServer()
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const incomingToken = parseToken(req.url)
    if (incomingToken !== token) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    const client: Client = { ws, alive: true }
    clients.add(client)
    ws.on('pong', () => {
      client.alive = true
    })
    ws.on('close', () => {
      clients.delete(client)
    })
    ws.on('error', () => {
      clients.delete(client)
    })

    const init: InitEvent = { type: 'init', now: Date.now(), backlog: backlog.slice() }
    try {
      ws.send(JSON.stringify(init))
    } catch {
      clients.delete(client)
    }
  })

  const broadcast = (ev: LogEvent) => {
    pushBacklog(ev)
    const data = JSON.stringify(ev)
    for (const c of clients) {
      try {
        c.ws.send(data)
      } catch {
        clients.delete(c)
      }
    }
  }

  const pingInterval = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        try {
          c.ws.terminate()
        } catch {
          // ignore
        }
        clients.delete(c)
        continue
      }
      c.alive = false
      try {
        c.ws.ping()
      } catch {
        clients.delete(c)
      }
    }
  }, 10_000)

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        clearInterval(pingInterval)
        reject(new Error('ws_listen_failed'))
        return
      }
      const wsUrl = `ws://127.0.0.1:${addr.port}/?token=${token}`
      resolve({
        wsUrl,
        token,
        broadcast,
        snapshotBacklog: () => backlog.slice(),
        close: async () => {
          clearInterval(pingInterval)
          for (const c of clients) {
            try {
              c.ws.close()
            } catch {
              // ignore
            }
          }
          clients.clear()
          await new Promise<void>((r) => server.close(() => r()))
        },
      })
    })
    server.on('error', (e) => {
      clearInterval(pingInterval)
      reject(e)
    })
  })
}
```

- [ ] **Step 3: Typecheck**

Run:

```bash
cd /workspace/desktop
npx tsc -p tsconfig.json --noEmit
```

Expected: no TS errors.

## Task 4: Implement ProcessManager (spawn/stop/parse/log routing)

**Files**
- Create: `/workspace/desktop/electron/main/processManager.ts`

- [ ] **Step 1: Create ProcessManager**

Create:

```ts
// /workspace/desktop/electron/main/processManager.ts
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import readline from 'node:readline'

import type { LogEvent, LogLevel, StartTaskConfig, StatusEvent } from '../shared/protocol'

export type ProcessManagerEvents = {
  emitLog: (ev: LogEvent) => void
  emitStatus: (ev: StatusEvent) => void
}

const LEVEL_RE =
  /^\[(INFO|WARN|ERROR|SUCCESS|PROGRESS)\]\s*(?:\[(?<module>[^\]]+)\]\s*)?(?<message>.*)$/

const safeNow = () => Date.now()

const parseLine = (line: string, stream: 'stdout' | 'stderr', seq: number): LogEvent => {
  const trimmed = line.replace(/\r?\n$/, '')
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed) as unknown
      if (typeof obj === 'object' && obj !== null && (obj as any).type === 'log') {
        return {
          type: 'log',
          seq,
          level: ((obj as any).level as LogLevel) ?? 'RAW',
          timestamp: (obj as any).timestamp ?? safeNow(),
          module: (obj as any).module,
          message: (obj as any).message ?? trimmed,
          stream,
        }
      }
    } catch {
      // ignore
    }
  }

  const m = LEVEL_RE.exec(trimmed)
  if (!m) {
    return { type: 'log', seq, level: 'RAW', timestamp: safeNow(), message: trimmed, stream }
  }
  const level = m[1] as LogLevel
  const module = (m.groups?.module || '').trim()
  const message = (m.groups?.message || '').trim()
  return {
    type: 'log',
    seq,
    level,
    timestamp: safeNow(),
    module: module ? module : undefined,
    message,
    stream,
  }
}

export class ProcessManager {
  private child: ChildProcessWithoutNullStreams | null = null
  private seq = 0
  private stopTimer: NodeJS.Timeout | null = null
  private rlOut: readline.Interface | null = null
  private rlErr: readline.Interface | null = null

  constructor(private events: ProcessManagerEvents) {}

  isRunning(): boolean {
    return this.child !== null
  }

  async startTask(config: StartTaskConfig): Promise<{ ok: true } | { ok: false; error: string }> {
    if (this.child) {
      this.events.emitStatus({ type: 'status', status: 'error', timestamp: safeNow(), detail: 'process_already_running' })
      return { ok: false, error: 'process_already_running' }
    }

    this.events.emitStatus({ type: 'status', status: 'starting', timestamp: safeNow() })

    const args = ['-u', '/workspace/MediaCrawler/main.py', ...config.args]
    const child = spawn('python3', args, {
      cwd: config.cwd,
      env: { ...process.env, ...(config.env || {}) },
      stdio: 'pipe',
    })
    this.child = child

    const cleanup = () => {
      if (this.stopTimer) {
        clearTimeout(this.stopTimer)
        this.stopTimer = null
      }
      if (this.rlOut) {
        this.rlOut.close()
        this.rlOut = null
      }
      if (this.rlErr) {
        this.rlErr.close()
        this.rlErr = null
      }
      if (this.child) {
        this.child.removeAllListeners()
      }
      this.child = null
    }

    this.rlOut = readline.createInterface({ input: child.stdout })
    this.rlOut.on('line', (line) => {
      this.events.emitLog(parseLine(line, 'stdout', this.seq++))
    })

    this.rlErr = readline.createInterface({ input: child.stderr })
    this.rlErr.on('line', (line) => {
      this.events.emitLog(parseLine(line, 'stderr', this.seq++))
    })

    child.on('error', (e) => {
      this.events.emitStatus({ type: 'status', status: 'error', timestamp: safeNow(), detail: String(e) })
      cleanup()
    })

    child.on('exit', (code, signal) => {
      const detail = `exit code=${code ?? 'null'} signal=${signal ?? 'null'}`
      this.events.emitStatus({ type: 'status', status: 'stopped', timestamp: safeNow(), detail })
      cleanup()
    })

    this.events.emitStatus({ type: 'status', status: 'running', timestamp: safeNow() })
    return { ok: true }
  }

  async stopTask(): Promise<{ ok: true }> {
    if (!this.child) {
      this.events.emitStatus({ type: 'status', status: 'stopped', timestamp: safeNow(), detail: 'not_running' })
      return { ok: true }
    }

    const child = this.child
    this.events.emitStatus({ type: 'status', status: 'stopping', timestamp: safeNow() })

    try {
      child.kill('SIGTERM')
    } catch {
      // ignore
    }

    await new Promise<void>((resolve) => {
      const done = () => resolve()
      const timer = setTimeout(() => done(), 3000)
      this.stopTimer = timer
      child.once('exit', () => {
        clearTimeout(timer)
        this.stopTimer = null
        done()
      })
    })

    if (this.child) {
      try {
        this.child.kill('SIGKILL')
      } catch {
        // ignore
      }
    }

    return { ok: true }
  }
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
cd /workspace/desktop
npx tsc -p tsconfig.json --noEmit
```

Expected: no TS errors.

## Task 5: Wire Main process IPC + WebSocket broadcast + IPC fallback

**Files**
- Modify: `/workspace/desktop/electron/main/index.ts`

- [ ] **Step 1: Update main to create LogServer + ProcessManager**

Replace current `ipcMain.handle('ping'...)`-only wiring with:

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { startLogServer } from './logServer'
import { ProcessManager } from './processManager'
import type { LogEvent, StatusEvent } from '../shared/protocol'
import { isStartTaskConfig } from '../shared/protocol'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (process.env.ELECTRON_NO_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox')
}

let mainWindow: BrowserWindow | null = null
let logServer: Awaited<ReturnType<typeof startLogServer>> | null = null
let proc: ProcessManager | null = null

const sendToRenderer = (ev: LogEvent | StatusEvent) => {
  if (!mainWindow) return
  try {
    mainWindow.webContents.send('log:event', ev)
  } catch {
    // ignore
  }
}

async function createWindow() {
  logServer = await startLogServer({ backlogMax: 1000 })

  proc = new ProcessManager({
    emitLog: (ev) => {
      logServer?.broadcast(ev)
      sendToRenderer(ev)
    },
    emitStatus: (ev) => {
      sendToRenderer(ev)
    },
  })

  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  ipcMain.handle('task:wsInfo', async () => {
    if (!logServer) throw new Error('log_server_not_ready')
    return { wsUrl: logServer.wsUrl }
  })

  ipcMain.handle('task:start', async (_e, payload: unknown) => {
    if (!proc) return { ok: false, error: 'proc_not_ready' }
    if (!isStartTaskConfig(payload)) return { ok: false, error: 'bad_payload' }
    return proc.startTask(payload)
  })

  ipcMain.handle('task:stop', async () => {
    if (!proc) return { ok: true }
    return proc.stopTask()
  })

  ipcMain.handle('ping', async () => 'pong')

  const devUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', async () => {
  try {
    await proc?.stopTask()
  } catch {
    // ignore
  }
  try {
    await logServer?.close()
  } catch {
    // ignore
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

Notes:
- `wsUrl` already includes token in query string inside `startLogServer`, but IPC exposes only `wsUrl` (token included). Preload will keep it private from renderer code by returning it via API; renderer still uses it to connect but never logs it.

- [ ] **Step 2: Typecheck**

Run:

```bash
cd /workspace/desktop
npx tsc -p tsconfig.json --noEmit
```

Expected: no TS errors.

## Task 6: Preload API surface (start/stop/onLog/getLogStreamInfo)

**Files**
- Modify: `/workspace/desktop/electron/preload/index.ts`
- Modify: `/workspace/desktop/electron/preload/index.d.ts`

- [ ] **Step 1: Extend preload typings**

Update `electron/preload/index.d.ts`:

```ts
export {}

declare global {
  interface Window {
    electronAPI: {
      ping: () => Promise<string>
      getLogStreamInfo: () => Promise<{ wsUrl: string }>
      startTask: (config: { args: string[]; cwd?: string; env?: Record<string, string> }) => Promise<{ ok: true } | { ok: false; error: string }>
      stopTask: () => Promise<{ ok: true }>
      onLog: (cb: (ev: unknown) => void) => () => void
    }
  }
}
```

- [ ] **Step 2: Implement preload functions with runtime checks**

Replace preload with:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { isEventEnvelope, isStartTaskConfig } from '../shared/protocol'

const channel = 'log:event'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),

  getLogStreamInfo: async () => {
    const res = await ipcRenderer.invoke('task:wsInfo')
    if (!res || typeof res !== 'object' || typeof (res as any).wsUrl !== 'string') {
      throw new Error('bad_ws_info')
    }
    return { wsUrl: (res as any).wsUrl as string }
  },

  startTask: async (config: unknown) => {
    if (!isStartTaskConfig(config)) return { ok: false as const, error: 'bad_payload' }
    const res = await ipcRenderer.invoke('task:start', config)
    if (!res || typeof res !== 'object' || typeof (res as any).ok !== 'boolean') {
      return { ok: false as const, error: 'bad_response' }
    }
    return res as any
  },

  stopTask: async () => {
    await ipcRenderer.invoke('task:stop')
    return { ok: true as const }
  },

  onLog: (cb: (ev: unknown) => void) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (!isEventEnvelope(payload)) return
      cb(payload)
    }
    ipcRenderer.on(channel, handler as any)
    return () => {
      ipcRenderer.removeListener(channel, handler as any)
    }
  },
})
```

- [ ] **Step 3: Typecheck**

Run:

```bash
cd /workspace/desktop
npx tsc -p tsconfig.json --noEmit
```

Expected: no TS errors.

## Task 7: Renderer WS client + reconnect + terminal UI + controls

**Files**
- Modify: `/workspace/desktop/src/App.tsx`

- [ ] **Step 1: Implement WS connect + reconnection**

Replace App with the following minimal UI:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { EventEnvelope, LogEvent, StatusEvent } from '@shared/protocol'
import { isEventEnvelope } from '@shared/protocol'

type Line = LogEvent | StatusEvent

const cap = <T,>(xs: T[], max: number) => (xs.length > max ? xs.slice(xs.length - max) : xs)

const levelColor = (level: string) => {
  switch (level) {
    case 'ERROR':
      return '#ff4d4f'
    case 'WARN':
      return '#faad14'
    case 'SUCCESS':
      return '#52c41a'
    case 'PROGRESS':
      return '#1890ff'
    case 'INFO':
      return '#d9d9d9'
    default:
      return '#8c8c8c'
  }
}

export default function App() {
  const [ping, setPing] = useState<string>('...')
  const [lines, setLines] = useState<Line[]>([])
  const [connected, setConnected] = useState(false)
  const [running, setRunning] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<number>(0)
  const stoppedRef = useRef<boolean>(false)

  const append = (ev: Line) => {
    setLines((prev) => cap([...prev, ev], 2000))
    if (ev.type === 'status') {
      setRunning(ev.status === 'running' || ev.status === 'starting' || ev.status === 'stopping')
    }
  }

  useEffect(() => {
    window.electronAPI.ping().then(setPing).catch(() => setPing('error'))
    const off = window.electronAPI.onLog((ev) => {
      append(ev as any)
    })
    return () => off()
  }, [])

  const connectWs = async () => {
    const { wsUrl } = await window.electronAPI.getLogStreamInfo()
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      retryRef.current = 0
      setConnected(true)
    }
    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      if (stoppedRef.current) return
      const n = retryRef.current++
      const delay = Math.min(250 * 2 ** n, 2000)
      window.setTimeout(() => {
        connectWs().catch(() => {
          // keep retrying
        })
      }, delay)
    }
    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
    ws.onmessage = (msg) => {
      try {
        const obj = JSON.parse(String(msg.data)) as unknown
        if (!isEventEnvelope(obj)) return
        const e = obj as EventEnvelope
        if (e.type === 'init') {
          for (const item of e.backlog) append(item)
          return
        }
        append(e)
      } catch {
        return
      }
    }
  }

  useEffect(() => {
    stoppedRef.current = false
    connectWs().catch(() => {
      // retry happens via ws.onclose path only; keep silent
    })
    return () => {
      stoppedRef.current = true
      try {
        wsRef.current?.close()
      } catch {
        // ignore
      }
      wsRef.current = null
    }
  }, [])

  const start = async () => {
    const res = await window.electronAPI.startTask({ args: [] })
    if (!res.ok) {
      append({ type: 'status', status: 'error', timestamp: Date.now(), detail: res.error })
    }
  }

  const stop = async () => {
    await window.electronAPI.stopTask()
    append({ type: 'log', seq: Number.MAX_SAFE_INTEGER, level: 'SUCCESS', timestamp: Date.now(), message: '任务已终止', stream: 'stdout' })
  }

  const header = useMemo(
    () => ({
      fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      padding: 16,
      borderBottom: '1px solid #303030',
      display: 'flex',
      gap: 12,
      alignItems: 'center',
    }),
    [],
  )

  return (
    <div style={{ height: '100vh', background: '#141414', color: '#f0f0f0', display: 'flex', flexDirection: 'column' }}>
      <div style={header}>
        <div style={{ fontWeight: 600 }}>Desktop</div>
        <div style={{ opacity: 0.8 }}>ping: {ping}</div>
        <div style={{ opacity: 0.8 }}>ws: {connected ? 'connected' : 'disconnected'}</div>
        <div style={{ flex: 1 }} />
        <button onClick={start} disabled={running} style={{ padding: '6px 10px' }}>
          开始任务
        </button>
        <button onClick={stop} disabled={!running} style={{ padding: '6px 10px' }}>
          停止任务
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
        {lines.map((l, idx) => {
          const ts = new Date(l.timestamp).toLocaleTimeString()
          const label = l.type === 'log' ? l.level : l.status.toUpperCase()
          const color = l.type === 'log' ? levelColor(l.level) : '#9254de'
          const msg =
            l.type === 'log'
              ? (l.module ? `[${l.module}] ${l.message}` : l.message)
              : l.detail
                ? `${l.status}: ${l.detail}`
                : l.status
          return (
            <div key={idx} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 6 }}>
              <span style={{ opacity: 0.55, marginRight: 10 }}>{ts}</span>
              <span style={{ color, marginRight: 10 }}>[{label}]</span>
              <span>{msg}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
cd /workspace/desktop
npx tsc -p tsconfig.json --noEmit
```

Expected: no TS errors.

## Task 8: Validation (dev run)

**Files**
- (no changes)

- [ ] **Step 1: Run dev**

Run:

```bash
cd /workspace/desktop
npm run dev
```

Expected:
- App starts successfully.
- Clicking “开始任务” spawns `python3 -u /workspace/MediaCrawler/main.py`.
- Logs stream into terminal area; WS disconnect/reconnect does not crash the app.

In sandbox/headless, use:

```bash
cd /workspace/desktop
xvfb-run -a npm run dev
```

- [ ] **Step 2: Stop behavior**

Expected:
- Clicking “停止任务” sends SIGTERM, then SIGKILL after 3s if needed.
- UI shows a SUCCESS line `任务已终止`.
- After exit, no additional logs arrive and process is not running.

## Self-Review Checklist (plan author)

- Spec coverage:
  - spawn + log parsing: Task 4
  - WS dynamic port + token + broadcast/backlog: Task 3
  - IPC fallback: Task 5/6
  - preload safe API: Task 6
  - renderer terminal + reconnect: Task 7
- Placeholder scan: none (all file paths, code, and commands included)
- Type consistency: shared protocol types used by preload and renderer
