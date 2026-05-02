export type ResourcePhase = 'checking' | 'downloading' | 'ready' | 'error'

export type EnsureResourcesRequest = Record<string, never>

export type EnsureResourcesResult = { ok: true } | { ok: false; error: string }

export type ResourceProgressEvent = {
  type: 'resources'
  phase: ResourcePhase
  percent?: number
  message?: string
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isString = (v: unknown): v is string => typeof v === 'string'

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const isResourcePhase = (v: unknown): v is ResourcePhase =>
  v === 'checking' || v === 'downloading' || v === 'ready' || v === 'error'

export const isEnsureResourcesRequest = (v: unknown): v is EnsureResourcesRequest => {
  if (!isRecord(v)) return false
  return Object.keys(v).length === 0
}

export const isEnsureResourcesResult = (v: unknown): v is EnsureResourcesResult => {
  if (!isRecord(v)) return false
  for (const k of Object.keys(v)) {
    if (k !== 'ok' && k !== 'error') return false
  }
  if (typeof v.ok !== 'boolean') return false
  if (v.ok) return true
  return isString(v.error)
}

export const isResourceProgressEvent = (v: unknown): v is ResourceProgressEvent => {
  if (!isRecord(v)) return false
  for (const k of Object.keys(v)) {
    if (k !== 'type' && k !== 'phase' && k !== 'percent' && k !== 'message') return false
  }
  if (v.type !== 'resources') return false
  if (!isResourcePhase(v.phase)) return false
  if (v.percent !== undefined && !isNumber(v.percent)) return false
  if (v.message !== undefined && !isString(v.message)) return false
  return true
}

