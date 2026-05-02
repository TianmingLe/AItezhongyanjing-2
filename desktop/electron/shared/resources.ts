export type ResourcePhase = 'checking' | 'downloading' | 'ready' | 'error'

export type EnsureResourcesRequest = Record<string, never>

export type EnsureResourcesResult = { ok: true } | { ok: false; error: string }

export type ResourceProgressEvent = {
  type: 'resources'
  phase: ResourcePhase
  percent?: number
  message?: string
}

export type ManifestItem = {
  name: string
  url: string
  sha256: string
  dest: string
  size_mb?: number
}

export type ManifestSchema = {
  version: string
  resources: ManifestItem[]
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isString = (v: unknown): v is string => typeof v === 'string'

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const sha256Re = /^[a-f0-9]{64}$/i

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

export const isManifestItem = (v: unknown): v is ManifestItem => {
  if (!isRecord(v)) return false
  for (const k of Object.keys(v)) {
    if (k !== 'name' && k !== 'url' && k !== 'sha256' && k !== 'dest' && k !== 'size_mb') return false
  }
  if (!isString(v.name) || !v.name) return false
  if (!isString(v.url) || !v.url) return false
  if (!isString(v.sha256) || !sha256Re.test(v.sha256)) return false
  if (!isString(v.dest) || !v.dest) return false
  if (v.size_mb !== undefined && !isNumber(v.size_mb)) return false
  return true
}

export const isManifestSchema = (v: unknown): v is ManifestSchema => {
  if (!isRecord(v)) return false
  for (const k of Object.keys(v)) {
    if (k !== 'version' && k !== 'resources') return false
  }
  if (!isString(v.version) || !v.version) return false
  if (!Array.isArray(v.resources)) return false
  if (!v.resources.every(isManifestItem)) return false
  return true
}
