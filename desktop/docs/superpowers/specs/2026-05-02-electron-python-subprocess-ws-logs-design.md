# Phase 5 Task 2 Design: Python Subprocess + WebSocket Logs

## Scope

Implement in Electron app under `/workspace/desktop`:

- Spawn a Python subprocess to run `/workspace/MediaCrawler/main.py` without modifying MediaCrawler code.
- Stream stdout/stderr in real time, parse with level regex, normalize into structured events.
- Broadcast logs to Renderer via a lightweight local WebSocket server (dynamic port + token).
- Provide lifecycle management (start/stop/timeout kill/exit/error) and cleanup (no leaked handles/listeners).
- Keep `contextIsolation: true`, `nodeIntegration: false`, and expose a safe preload API only.

Non-goals:

- Packaging/distribution path adaptation (defer to later tasks).
- Replacing Electron IPC with WebSocket (WS used only for broadcast logs).
- Changing MediaCrawler logging format.

## Architecture

### Components

- Main process
  - `ProcessManager` (child process lifecycle + log pipes)
  - `LogServer` (WS server + auth token + broadcast + backlog buffer)
  - IPC handlers to bridge Renderer requests and to provide WS connection info
- Preload
  - Type-checked, whitelist API: `startTask`, `stopTask`, `onLog`, `getLogStreamInfo`
- Renderer
  - Connects to WS using `{ wsUrl, token }` from preload
  - Auto reconnect + backlog replay
  - Minimal terminal UI rendering by log level (CSS); ANSI parsing can be added later if needed

### Data Flow

1. Renderer calls `window.electronAPI.getLogStreamInfo()` to obtain `{ wsUrl, token }`.
2. Renderer connects `new WebSocket(wsUrlWithToken)` and registers message handler.
3. Renderer calls `window.electronAPI.startTask({ args })`.
4. Main spawns `python3 -u /workspace/MediaCrawler/main.py ...args`.
5. Main reads stdout/stderr line-by-line, parses into `LogEvent` and broadcasts:
   - primary: `LogServer.broadcast(event)`
   - fallback: `webContents.send('log:event', event)` (when WS unavailable)
6. Renderer displays logs; when WS disconnects, it reconnects with backoff and receives an `InitEvent` with backlog.

## Security Model

- WS binds to `127.0.0.1` only.
- WS port is dynamic (OS-assigned).
- Each app launch generates a random token; connection requires token in query string `?token=...`.
- Token is never persisted; not printed to logs.
- Preload is the only source of wsUrl/token to renderer.
- IPC only exposes explicit handlers; no generic `ipcRenderer` passthrough.

## Message Schema

All messages are JSON objects with a top-level `type`.

### Main → Renderer

#### LogEvent

```ts
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'PROGRESS' | 'RAW'

type LogEvent = {
  type: 'log'
  seq: number
  level: LogLevel
  timestamp: number
  module?: string
  message: string
  stream: 'stdout' | 'stderr'
}
```

#### StatusEvent

```ts
type StatusEvent = {
  type: 'status'
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
  timestamp: number
  detail?: string
}
```

#### InitEvent

```ts
type InitEvent = {
  type: 'init'
  now: number
  backlog: LogEvent[]
}
```

### Renderer → Main (IPC only)

```ts
type StartTaskConfig = {
  args: string[]
  cwd?: string
  env?: Record<string, string>
}
```

## Log Parsing

- Read stdout/stderr line-by-line.
- Regex:

```
^\[(INFO|WARN|ERROR|SUCCESS|PROGRESS)\]\s*(?:\[(?<module>[^\]]+)\]\s*)?(?<message>.*)$
```

- If line is JSON and matches `LogEvent | StatusEvent`, accept and broadcast as-is.
- Else if regex matches, map to `{ level, module, message }` and add `timestamp`, `seq`, `stream`.
- Else treat as `{ level: 'RAW', message: line }`.

## Process Lifecycle

### startTask

- If a process is already running:
  - default behavior: reject with a `StatusEvent{ status:'error' }` and return a failure result to renderer.
- Spawn:
  - command: `python3`
  - args: `['-u', '/workspace/MediaCrawler/main.py', ...config.args]`
  - do not block event loop; do not use sync IO.
- Attach:
  - stdout/stderr → line reader → log parser → broadcast
  - `child.on('error')` → `StatusEvent('error')`
  - `child.on('exit')` → `StatusEvent('stopped')` and cleanup

### stopTask

- If not running: no-op with `StatusEvent('stopped')`.
- Send `SIGTERM`, wait up to 3 seconds.
- If still alive: send `SIGKILL`.
- Ensure cleanup runs exactly once.

### App shutdown

- On `app.before-quit`, call `stopTask()` and prevent orphan processes.

## WebSocket Server

- Uses `ws` library.
- Listens on `127.0.0.1:0`, then reads actual port.
- Connection auth:
  - Parse query `token`, compare to in-memory token.
  - If invalid, close immediately.
- Backlog:
  - Keep a ring buffer of last N `LogEvent` (e.g. 1000).
  - On connect, send `InitEvent { backlog }`.
- Broadcast:
  - JSON serialize events; ignore failures; remove dead clients.

## Preload API

Expose under `window.electronAPI`:

- `startTask(config: StartTaskConfig): Promise<{ ok: true } | { ok: false; error: string }>`
- `stopTask(): Promise<{ ok: true }>`
- `onLog(cb: (ev: LogEvent | StatusEvent) => void): () => void`
- `getLogStreamInfo(): Promise<{ wsUrl: string; token: string }>`

Type guards:

- Validate inbound IPC args for `startTask`.
- Validate inbound WS/IPC payloads in renderer before rendering.

## Renderer UX (Minimal)

- Start/Stop buttons.
- Terminal panel:
  - append new events (keep a capped list, e.g. last 2000 lines)
  - color by `level` via CSS classes
- WS reconnect:
  - exponential backoff up to 2 seconds
  - after reconnect, expect `InitEvent` to refill missed logs
- Fallback:
  - also listen to preload `onLog` (IPC channel) so logs still appear even if WS is down.

## Validation Plan (Acceptance)

- Start:
  - click Start → `StatusEvent('starting'|'running')` received
  - stdout/stderr logs appear and scroll
- Stop:
  - click Stop → `StatusEvent('stopping'|'stopped')` received
  - process is not running and listeners/timers cleaned
- WS reconnect:
  - simulate WS close, renderer reconnects and receives backlog init
- No MediaCrawler changes:
  - verify no writes under `/workspace/MediaCrawler`
