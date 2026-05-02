import type { TaskFormState } from './argsBuilder'

export const defaultTaskFormState = (): TaskFormState => ({
  platform: 'dy',
  mode: 'detail',
  specified_id: '',
  keyword: '',
  limit: 20,
  ocr_enabled: false,
  comment_depth: 0,
  enable_llm: false,
  llm_model: '',
  llm_base_url: '',
  llm_api_key: '',
})

const readValue = (args: string[], flag: string) => {
  const idx = args.indexOf(flag)
  if (idx === -1) return null
  const v = args[idx + 1]
  return typeof v === 'string' ? v : null
}

export const parseCliArgsToForm = (args: string[], base: TaskFormState): TaskFormState => {
  const next: TaskFormState = { ...base }

  const platform = readValue(args, '--platform')
  if (platform === 'dy' || platform === 'xhs' || platform === 'bili') next.platform = platform

  const specifiedId = readValue(args, '--specified_id')
  const keyword = readValue(args, '--keyword')
  const limit = readValue(args, '--limit')

  if (keyword) {
    next.mode = 'search'
    next.keyword = keyword
    if (limit && Number.isFinite(Number(limit))) next.limit = Number(limit)
  } else {
    next.mode = 'detail'
    if (specifiedId) next.specified_id = specifiedId
  }

  next.ocr_enabled = args.includes('--ocr-enabled')

  const commentDepth = readValue(args, '--comment-depth')
  if (commentDepth && Number.isFinite(Number(commentDepth))) next.comment_depth = Number(commentDepth)

  next.enable_llm = args.includes('--enable-llm')
  const llmModel = readValue(args, '--llm-model')
  const llmBaseUrl = readValue(args, '--llm-base-url')
  if (llmModel) next.llm_model = llmModel
  if (llmBaseUrl) next.llm_base_url = llmBaseUrl
  next.llm_api_key = ''

  return next
}

