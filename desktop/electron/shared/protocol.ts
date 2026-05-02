export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'PROGRESS' | 'RAW'

export type LogEvent = {
  type: 'log'
  level: LogLevel
  timestamp: number
  module?: string
  message: string
  stream: 'stdout' | 'stderr'
}

export type Status = 'idle' | 'running' | 'stopping'

export type StatusEvent = {
  type: 'status'
  status: Status
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

export const isStatus = (v: unknown): v is Status => v === 'idle' || v === 'running' || v === 'stopping'

export const isStatusEvent = (v: unknown): v is StatusEvent => {
  if (!isRecord(v)) return false
  if (v.type !== 'status') return false
  if (!isStatus(v.status)) return false
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
