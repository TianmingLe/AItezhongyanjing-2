import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import * as readline from 'node:readline'

import type { EventEnvelope, LogEvent, LogLevel, ManagerStatus, StartTaskConfig, StatusEvent, TaskStatus } from '../shared/protocol'
import { isStartTaskConfig } from '../shared/protocol'

type Listener = (ev: EventEnvelope) => void

type Options = {
  pythonExecPath?: string
  entryPath?: string
}

const LEVEL_RE = /^\[(INFO|WARN|ERROR|SUCCESS|PROGRESS)\]\s*(.*)$/
const MODULE_RE = /^\[(?<module>[^\]]+)\]\s*(?<message>.*)$/

const now = () => Date.now()

const dangerousEnvKeys = new Set([
  'PATH',
  'PYTHONPATH',
  'PYTHONHOME',
  'VIRTUAL_ENV',
  'LD_LIBRARY_PATH',
  'DYLD_LIBRARY_PATH',
  'NODE_OPTIONS',
  'ELECTRON_RUN_AS_NODE',
])

const isDangerousEnvOverride = (env: Record<string, string>) =>
  Object.keys(env).some((k) => dangerousEnvKeys.has(k) || k.startsWith('LD_') || k.startsWith('DYLD_'))

const parseLine = (line: string, stream: 'stdout' | 'stderr'): Omit<LogEvent, 'type' | 'timestamp'> & { type: 'log' } => {
  const trimmed = line.replace(/\r?\n$/, '')
  const m = LEVEL_RE.exec(trimmed)
  if (!m) {
    return { type: 'log', level: 'RAW', message: trimmed, stream }
  }
  const level = m[1] as LogLevel
  const rest = (m[2] || '').trim()
  const m2 = MODULE_RE.exec(rest)
  if (!m2) {
    return { type: 'log', level, message: rest, stream }
  }
  const module = (m2.groups?.module || '').trim()
  const message = (m2.groups?.message || '').trim()
  return { type: 'log', level, module: module || undefined, message, stream }
}

export class ProcessManager {
  private status: ManagerStatus = 'idle'
  private child: ChildProcessWithoutNullStreams | null = null
  private stopTimer: NodeJS.Timeout | null = null
  private rlOut: readline.Interface | null = null
  private rlErr: readline.Interface | null = null
  private listeners = new Set<Listener>()
  private finalized = false
  private stopRequested = false

  private pythonExecPath: string
  private entryPath: string

  constructor(opts?: Options) {
    this.pythonExecPath = opts?.pythonExecPath || 'python3'
    this.entryPath = opts?.entryPath || '/workspace/MediaCrawler/main.py'
  }

  getStatus(): ManagerStatus {
    return this.status
  }

  getPid(): number | null {
    return this.child?.pid ?? null
  }

  onEvent(cb: Listener): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  private emit(ev: EventEnvelope) {
    for (const cb of this.listeners) {
      try {
        cb(ev)
      } catch {
        // ignore
      }
    }
  }

  private emitTaskStatus(status: TaskStatus, detail?: string) {
    const ev: StatusEvent = { type: 'status', status, timestamp: now(), detail }
    this.emit(ev)
  }

  private finalize() {
    if (this.finalized) return
    this.finalized = true
    if (this.stopTimer) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }
    if (this.rlOut) {
      this.rlOut.close()
      this.rlOut.removeAllListeners()
      this.rlOut = null
    }
    if (this.rlErr) {
      this.rlErr.close()
      this.rlErr.removeAllListeners()
      this.rlErr = null
    }
    if (this.child) {
      this.child.removeAllListeners()
    }
    this.child = null
    this.status = 'idle'
    this.stopRequested = false
  }

  async startTask(config: unknown): Promise<{ ok: boolean; error?: string }> {
    if (!isStartTaskConfig(config)) {
      return { ok: false, error: 'bad_config' }
    }
    if (this.child) {
      this.emitTaskStatus('error', 'process_already_running')
      return { ok: false, error: 'process_already_running' }
    }
    if (config.env && isDangerousEnvOverride(config.env)) {
      return { ok: false, error: 'dangerous_env_override' }
    }

    this.finalized = false
    this.stopRequested = false
    this.status = 'running'
    this.emitTaskStatus('starting')

    const child = spawn(this.pythonExecPath, ['-u', this.entryPath, ...config.args], {
      cwd: config.cwd,
      env: {
        ...process.env,
        ...(config.env || {}),
        PYTHONUNBUFFERED: '1',
      },
      stdio: 'pipe',
    })

    this.child = child
    this.rlOut = readline.createInterface({ input: child.stdout })
    this.rlErr = readline.createInterface({ input: child.stderr })

    this.rlOut.on('line', (line) => {
      const parsed = parseLine(line, 'stdout')
      const ev: LogEvent = { ...parsed, timestamp: now() }
      this.emit(ev)
    })

    this.rlErr.on('line', (line) => {
      const parsed = parseLine(line, 'stderr')
      const ev: LogEvent = { ...parsed, timestamp: now() }
      this.emit(ev)
    })

    child.on('error', (e) => {
      this.emitTaskStatus('error', String(e))
      this.finalize()
    })

    child.on('exit', (code, signal) => {
      const detail = `exit:${code ?? 'null'}:${signal ?? 'null'}`
      if (this.stopRequested) {
        this.emitTaskStatus('stopped', detail)
      } else if (code === 0) {
        this.emitTaskStatus('stopped', detail)
      } else {
        this.emitTaskStatus('error', detail)
      }
      this.finalize()
    })

    this.emitTaskStatus('running')
    return { ok: true }
  }

  async stopTask(): Promise<{ ok: boolean }> {
    if (!this.child) {
      return { ok: true }
    }
    if (this.status === 'stopping') return { ok: true }

    const child = this.child
    this.status = 'stopping'
    this.stopRequested = true
    this.emitTaskStatus('stopping')

    try {
      child.kill('SIGTERM')
    } catch {
      // ignore
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 3000)
      this.stopTimer = timer
      child.once('exit', () => {
        clearTimeout(timer)
        this.stopTimer = null
        resolve()
      })
    })

    if (this.child) {
      try {
        this.child.kill('SIGKILL')
      } catch {
        // ignore
      }
      await new Promise<void>((r) => setTimeout(() => r(), 50))
      if (this.child) {
        this.emitTaskStatus('stopped', 'killed')
        this.finalize()
      }
    }

    return { ok: true }
  }
}
