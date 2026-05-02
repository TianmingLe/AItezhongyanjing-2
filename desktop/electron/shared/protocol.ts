export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'PROGRESS' | 'RAW'

export type LogEvent = {
  type: 'log'
  level: LogLevel
  timestamp: number
  module?: string
  message: string
  stream: 'stdout' | 'stderr'
}

export type ManagerStatus = 'idle' | 'running' | 'stopping'

export type TaskStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

export type StatusEvent = {
  type: 'status'
  status: TaskStatus
  timestamp: number
  detail?: string
}

export type InitEvent = {
  type: 'init'
  now: number
  backlog: EventEnvelope[]
}

export type StartTaskConfig = {
  args: string[]
  cwd?: string
  env?: Record<string, string>
}

export type EventEnvelope = LogEvent | StatusEvent

export type UninstallRequest = Record<string, never>

export type UninstallAction = { type: string; message: string }

export type UninstallResult = { ok: true; actions: UninstallAction[] } | { ok: false; error: string }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isString = (v: unknown): v is string => typeof v === 'string'

export const isLogLevel = (v: unknown): v is LogLevel =>
  v === 'INFO' || v === 'WARN' || v === 'ERROR' || v === 'SUCCESS' || v === 'PROGRESS' || v === 'RAW'

export const isLogEvent = (v: unknown): v is LogEvent => {
  if (!isRecord(v)) return false
  if (v.type !== 'log') return false
  if (!isLogLevel(v.level)) return false
  if (typeof v.timestamp !== 'number') return false
  if (!isString(v.message)) return false
  if (v.module !== undefined && !isString(v.module)) return false
  if (v.stream !== 'stdout' && v.stream !== 'stderr') return false
  return true
}

export const isTaskStatus = (v: unknown): v is TaskStatus =>
  v === 'starting' || v === 'running' || v === 'stopping' || v === 'stopped' || v === 'error'

export const isStatusEvent = (v: unknown): v is StatusEvent => {
  if (!isRecord(v)) return false
  if (v.type !== 'status') return false
  if (!isTaskStatus(v.status)) return false
  if (typeof v.timestamp !== 'number') return false
  if (v.detail !== undefined && !isString(v.detail)) return false
  return true
}

export const isInitEvent = (v: unknown): v is InitEvent => {
  if (!isRecord(v)) return false
  if (v.type !== 'init') return false
  if (typeof v.now !== 'number') return false
  if (!Array.isArray(v.backlog)) return false
  return v.backlog.every((x) => isLogEvent(x) || isStatusEvent(x))
}

export const isEventEnvelope = (v: unknown): v is EventEnvelope => isLogEvent(v) || isStatusEvent(v)

export const isStartTaskConfig = (v: unknown): v is StartTaskConfig => {
  if (!isRecord(v)) return false
  const keys = Object.keys(v)
  for (const k of keys) {
    if (k !== 'args' && k !== 'cwd' && k !== 'env') return false
  }
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

export const isUninstallRequest = (v: unknown): v is UninstallRequest => {
  if (!isRecord(v)) return false
  return Object.keys(v).length === 0
}

export const isUninstallResult = (v: unknown): v is UninstallResult => {
  if (!isRecord(v)) return false
  const keys = Object.keys(v)
  for (const k of keys) {
    if (k !== 'ok' && k !== 'actions' && k !== 'error') return false
  }
  if (typeof v.ok !== 'boolean') return false
  if (v.ok) {
    if (!Array.isArray(v.actions)) return false
    for (const a of v.actions) {
      if (!isRecord(a)) return false
      const ak = Object.keys(a)
      for (const k of ak) {
        if (k !== 'type' && k !== 'message') return false
      }
      if (!isString(a.type) || !isString(a.message)) return false
    }
    return v.error === undefined
  }
  if (!isString(v.error)) return false
  return v.actions === undefined
}
