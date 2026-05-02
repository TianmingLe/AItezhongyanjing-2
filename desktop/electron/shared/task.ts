import type { StartTaskConfig } from './protocol'
import { isStartTaskConfig } from './protocol'

export type StartWithRunRequest = StartTaskConfig

export type StartWithRunResult = { ok: true; runId: string; runDir: string } | { ok: false; error: string }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const isStartWithRunRequest = (v: unknown): v is StartWithRunRequest => isStartTaskConfig(v)

export const isStartWithRunResult = (v: unknown): v is StartWithRunResult => {
  if (!isRecord(v)) return false
  for (const k of Object.keys(v)) {
    if (k !== 'ok' && k !== 'runId' && k !== 'runDir' && k !== 'error') return false
  }
  if (typeof v.ok !== 'boolean') return false
  if (v.ok) return typeof v.runId === 'string' && typeof v.runDir === 'string'
  return typeof v.error === 'string'
}

