import type { EventEnvelope, InitEvent, StartTaskConfig } from '../shared/protocol'
import { isEventEnvelope, isInitEvent, isStartTaskConfig } from '../shared/protocol'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const parseStartTaskConfig = (v: unknown): StartTaskConfig | null => (isStartTaskConfig(v) ? v : null)

export const parseWsInfo = (v: unknown): { wsUrl: string; token: string } | null => {
  if (!isRecord(v)) return null
  const keys = Object.keys(v)
  for (const k of keys) {
    if (k !== 'wsUrl' && k !== 'token') return null
  }
  const wsUrl = v.wsUrl
  const token = v.token
  if (typeof wsUrl !== 'string') return null
  if (typeof token !== 'string') return null
  return { wsUrl, token }
}

export const parseStartStopResult = (v: unknown): { ok: boolean; error?: string } | null => {
  if (!isRecord(v)) return null
  const keys = Object.keys(v)
  for (const k of keys) {
    if (k !== 'ok' && k !== 'error') return null
  }
  const ok = v.ok
  const error = v.error
  if (typeof ok !== 'boolean') return null
  if (error === undefined) return { ok }
  if (typeof error !== 'string') return null
  return { ok, error }
}

export const parseIncomingEvent = (v: unknown): EventEnvelope | InitEvent | null => {
  if (isEventEnvelope(v)) return v
  if (isInitEvent(v)) return v
  return null
}
