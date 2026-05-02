type Platform = 'dy' | 'xhs' | 'bili'
type Mode = 'detail' | 'search'

export type TaskFormState = {
  platform: Platform
  mode: Mode
  specified_id: string
  keyword: string
  limit: number
  ocr_enabled: boolean
  comment_depth: number
  enable_llm: boolean
  llm_model: string
  llm_base_url: string
  llm_api_key: string
}

export type BuiltTask = { args: string[]; env?: Record<string, string> }

export type ValidationError = { field: string; message: string }

export const validateTask = (s: TaskFormState): ValidationError[] => {
  const errs: ValidationError[] = []
  if (!s.platform) errs.push({ field: 'platform', message: '请选择平台' })
  if (s.mode === 'detail') {
    if (!s.specified_id.trim()) errs.push({ field: 'specified_id', message: '请输入指定 ID' })
  } else {
    if (!s.keyword.trim()) errs.push({ field: 'keyword', message: '请输入关键词' })
    if (!Number.isFinite(s.limit) || s.limit <= 0) errs.push({ field: 'limit', message: 'limit 必须大于 0' })
  }
  if (!Number.isFinite(s.comment_depth) || s.comment_depth < 0) errs.push({ field: 'comment_depth', message: 'comment-depth 不能小于 0' })
  if (s.enable_llm) {
    if (!s.llm_model.trim()) errs.push({ field: 'llm_model', message: '请输入模型名称' })
    if (!s.llm_base_url.trim()) errs.push({ field: 'llm_base_url', message: '请输入 Base URL' })
  }
  return errs
}

export const buildArgs = (s: TaskFormState): BuiltTask => {
  const args: string[] = ['--platform', s.platform, '--pipeline', 'mvp']

  if (s.mode === 'detail') {
    args.push('--specified_id', s.specified_id.trim())
  } else {
    args.push('--keyword', s.keyword.trim(), '--limit', String(s.limit))
  }

  if (s.ocr_enabled) args.push('--ocr-enabled')
  if (s.comment_depth > 0) args.push('--comment-depth', String(s.comment_depth))

  const env: Record<string, string> = {}
  if (s.enable_llm) {
    args.push('--enable-llm')
    if (s.llm_model.trim()) args.push('--llm-model', s.llm_model.trim())
    if (s.llm_base_url.trim()) args.push('--llm-base-url', s.llm_base_url.trim())
    if (s.llm_api_key.trim()) env.OMNI_LLM_API_KEY = s.llm_api_key.trim()
  }

  return Object.keys(env).length ? { args, env } : { args }
}

