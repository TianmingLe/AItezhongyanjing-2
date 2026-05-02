export type ExportFormat = 'markdown' | 'pdf' | 'json'

export type ExportRequest = {
  runId: string
  format: ExportFormat
}

export type ExportResult = { ok: true; path: string } | { ok: false; error: string }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const isExportFormat = (v: unknown): v is ExportFormat => v === 'markdown' || v === 'pdf' || v === 'json'

export const isExportRequest = (v: unknown): v is ExportRequest => {
  if (!isRecord(v)) return false
  for (const k of Object.keys(v)) {
    if (k !== 'runId' && k !== 'format') return false
  }
  if (typeof v.runId !== 'string') return false
  if (!isExportFormat(v.format)) return false
  return true
}

export const isExportResult = (v: unknown): v is ExportResult => {
  if (!isRecord(v)) return false
  for (const k of Object.keys(v)) {
    if (k !== 'ok' && k !== 'path' && k !== 'error') return false
  }
  if (typeof v.ok !== 'boolean') return false
  if (v.ok) return typeof v.path === 'string'
  return typeof v.error === 'string'
}

