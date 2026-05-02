export type RunStatus = 'running' | 'success' | 'failed' | 'stopped' | 'unknown'

export type RunMeta = {
  run_id: string
  created_at_ms: number
  started_at_ms?: number
  finished_at_ms?: number
  status: RunStatus
  platform?: 'dy' | 'xhs' | 'bili'
  mode?: 'detail' | 'search'
  specified_id?: string
  keyword?: string
  limit?: number
  ocr_enabled?: boolean
  comment_depth?: number
  enable_llm?: boolean
  llm_model?: string
  llm_base_url?: string
  video_count?: number
  error_message?: string
  cli_args?: string[]
  warning?: string
  copied_from?: string
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isString = (v: unknown): v is string => typeof v === 'string'

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const isRunStatus = (v: unknown): v is RunStatus =>
  v === 'running' || v === 'success' || v === 'failed' || v === 'stopped' || v === 'unknown'

const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString)

const allowedKeys = new Set([
  'run_id',
  'created_at_ms',
  'started_at_ms',
  'finished_at_ms',
  'status',
  'platform',
  'mode',
  'specified_id',
  'keyword',
  'limit',
  'ocr_enabled',
  'comment_depth',
  'enable_llm',
  'llm_model',
  'llm_base_url',
  'video_count',
  'error_message',
  'cli_args',
  'warning',
  'copied_from',
])

export const isRunMeta = (v: unknown): v is RunMeta => {
  if (!isRecord(v)) return false
  for (const k of Object.keys(v)) {
    if (!allowedKeys.has(k)) return false
  }
  if (!isString(v.run_id)) return false
  if (!isNumber(v.created_at_ms)) return false
  if (v.started_at_ms !== undefined && !isNumber(v.started_at_ms)) return false
  if (v.finished_at_ms !== undefined && !isNumber(v.finished_at_ms)) return false
  if (!isRunStatus(v.status)) return false
  if (v.platform !== undefined && v.platform !== 'dy' && v.platform !== 'xhs' && v.platform !== 'bili') return false
  if (v.mode !== undefined && v.mode !== 'detail' && v.mode !== 'search') return false
  if (v.specified_id !== undefined && !isString(v.specified_id)) return false
  if (v.keyword !== undefined && !isString(v.keyword)) return false
  if (v.limit !== undefined && !isNumber(v.limit)) return false
  if (v.ocr_enabled !== undefined && !isBool(v.ocr_enabled)) return false
  if (v.comment_depth !== undefined && !isNumber(v.comment_depth)) return false
  if (v.enable_llm !== undefined && !isBool(v.enable_llm)) return false
  if (v.llm_model !== undefined && !isString(v.llm_model)) return false
  if (v.llm_base_url !== undefined && !isString(v.llm_base_url)) return false
  if (v.video_count !== undefined && !isNumber(v.video_count)) return false
  if (v.error_message !== undefined && !isString(v.error_message)) return false
  if (v.cli_args !== undefined && !isStringArray(v.cli_args)) return false
  if (v.warning !== undefined && !isString(v.warning)) return false
  if (v.copied_from !== undefined && !isString(v.copied_from)) return false
  return true
}

export type ResultsRootResult = { ok: true; path: string } | { ok: false; error: string }
export type ListRunsResult = { ok: true; items: RunMeta[] } | { ok: false; error: string }
export type ReadRunReportResult = { ok: true; markdown: string } | { ok: false; error: string }

export const isResultsRootResult = (v: unknown): v is ResultsRootResult => {
  if (!isRecord(v)) return false
  for (const k of Object.keys(v)) {
    if (k !== 'ok' && k !== 'path' && k !== 'error') return false
  }
  if (typeof v.ok !== 'boolean') return false
  if (v.ok) return isString(v.path)
  return isString(v.error)
}

export const isListRunsResult = (v: unknown): v is ListRunsResult => {
  if (!isRecord(v)) return false
  for (const k of Object.keys(v)) {
    if (k !== 'ok' && k !== 'items' && k !== 'error') return false
  }
  if (typeof v.ok !== 'boolean') return false
  if (v.ok) return Array.isArray(v.items) && v.items.every(isRunMeta)
  return isString(v.error)
}

export const isReadRunReportResult = (v: unknown): v is ReadRunReportResult => {
  if (!isRecord(v)) return false
  for (const k of Object.keys(v)) {
    if (k !== 'ok' && k !== 'markdown' && k !== 'error') return false
  }
  if (typeof v.ok !== 'boolean') return false
  if (v.ok) return isString(v.markdown)
  return isString(v.error)
}
