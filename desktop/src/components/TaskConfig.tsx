import { useMemo, useState } from 'react'

import type { BuiltTask, TaskFormState, ValidationError } from '@/utils/argsBuilder'
import { buildArgs, validateTask } from '@/utils/argsBuilder'

type Props = {
  busy: boolean
  onStart: (built: BuiltTask) => Promise<void>
  onStop: () => Promise<void>
  value?: TaskFormState
  onChange?: (next: TaskFormState) => void
}

const platformIcon = (p: TaskFormState['platform']) => {
  if (p === 'dy') return '🎵'
  if (p === 'xhs') return '📕'
  return '📺'
}

const errorText = (errs: ValidationError[], field: string) => errs.find((e) => e.field === field)?.message

export default function TaskConfig({ busy, onStart, onStop, value, onChange }: Props) {
  const [inner, setInner] = useState<TaskFormState>({
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
  const [errs, setErrs] = useState<ValidationError[]>([])
  const [showKey, setShowKey] = useState(false)

  const state = value ?? inner
  const setState = (next: TaskFormState) => {
    if (onChange) onChange(next)
    else setInner(next)
  }

  const built = useMemo(() => buildArgs(state), [state])
  const canStart = !busy

  const start = async () => {
    const v = validateTask(state)
    setErrs(v)
    if (v.length) return
    await onStart(built)
  }

  const stop = async () => {
    setErrs([])
    await onStop()
  }

  return (
    <div style={{ padding: 14, borderBottom: '1px solid #262626', background: '#101010' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
          <span style={{ opacity: 0.85 }}>平台</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div aria-hidden="true" style={{ fontSize: 18, width: 24, textAlign: 'center' }}>
              {platformIcon(state.platform)}
            </div>
            <select
              aria-label="平台"
              name="platform"
              value={state.platform}
              onChange={(e) => setState({ ...state, platform: e.target.value as TaskFormState['platform'] })}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #303030',
                background: '#141414',
                color: '#f0f0f0',
              }}
            >
              <option value="dy">抖音（dy）</option>
              <option value="xhs">小红书（xhs）</option>
              <option value="bili">B 站（bili）</option>
            </select>
          </div>
          {errorText(errs, 'platform') ? <div style={{ color: '#ff7875' }}>{errorText(errs, 'platform')}</div> : null}
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
          <div style={{ opacity: 0.85 }}>模式</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              aria-label="指定 ID 模式"
              onClick={() => setState({ ...state, mode: 'detail' })}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #303030',
                background: state.mode === 'detail' ? '#1a1a1a' : '#111111',
                color: '#f0f0f0',
                cursor: 'pointer',
              }}
            >
              detail
            </button>
            <button
              type="button"
              aria-label="关键词搜索模式"
              onClick={() => setState({ ...state, mode: 'search' })}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #303030',
                background: state.mode === 'search' ? '#1a1a1a' : '#111111',
                color: '#f0f0f0',
                cursor: 'pointer',
              }}
            >
              search
            </button>
          </div>
        </div>

        {state.mode === 'detail' ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 320 }}>
            <span style={{ opacity: 0.85 }}>指定 ID</span>
            <input
              aria-label="指定 ID"
              data-testid="specified-id"
              name="specified_id"
              autoComplete="off"
              value={state.specified_id}
              onChange={(e) => setState({ ...state, specified_id: e.target.value })}
              placeholder="例如：7341234567890…"
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #303030',
                background: '#141414',
                color: '#f0f0f0',
              }}
            />
            {errorText(errs, 'specified_id') ? <div style={{ color: '#ff7875' }}>{errorText(errs, 'specified_id')}</div> : null}
          </label>
        ) : (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 320 }}>
              <span style={{ opacity: 0.85 }}>关键词</span>
              <input
                aria-label="关键词"
                name="keyword"
                autoComplete="off"
                value={state.keyword}
                onChange={(e) => setState({ ...state, keyword: e.target.value })}
                placeholder="例如：城市探店…"
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid #303030',
                  background: '#141414',
                  color: '#f0f0f0',
                }}
              />
              {errorText(errs, 'keyword') ? <div style={{ color: '#ff7875' }}>{errorText(errs, 'keyword')}</div> : null}
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 140 }}>
              <span style={{ opacity: 0.85 }}>limit</span>
              <input
                aria-label="limit"
                name="limit"
                autoComplete="off"
                type="number"
                inputMode="numeric"
                value={state.limit}
                onChange={(e) => setState({ ...state, limit: Number(e.target.value) })}
                placeholder="20…"
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid #303030',
                  background: '#141414',
                  color: '#f0f0f0',
                }}
              />
              {errorText(errs, 'limit') ? <div style={{ color: '#ff7875' }}>{errorText(errs, 'limit')}</div> : null}
            </label>
          </>
        )}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          data-testid="start-btn"
          onClick={start}
          disabled={!canStart}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #303030',
            background: canStart ? '#1a1a1a' : '#0f0f0f',
            color: canStart ? '#f0f0f0' : '#8c8c8c',
            cursor: canStart ? 'pointer' : 'not-allowed',
          }}
        >
          开始任务
        </button>
        <button
          type="button"
          data-testid="stop-btn"
          onClick={stop}
          disabled={!busy}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #303030',
            background: busy ? '#111111' : '#0f0f0f',
            color: busy ? '#f0f0f0' : '#8c8c8c',
            cursor: busy ? 'pointer' : 'not-allowed',
          }}
        >
          停止任务
        </button>
      </div>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', opacity: 0.9 }}>高级参数</summary>
        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              name="ocr_enabled"
              checked={state.ocr_enabled}
              onChange={(e) => setState({ ...state, ocr_enabled: e.target.checked })}
            />
            <span>OCR</span>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 180 }}>
            <span style={{ opacity: 0.85 }}>评论深度</span>
            <input
              aria-label="评论深度"
              name="comment_depth"
              autoComplete="off"
              type="number"
              inputMode="numeric"
              value={state.comment_depth}
              onChange={(e) => setState({ ...state, comment_depth: Number(e.target.value) })}
              placeholder="0…"
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #303030',
                background: '#141414',
                color: '#f0f0f0',
              }}
            />
            {errorText(errs, 'comment_depth') ? <div style={{ color: '#ff7875' }}>{errorText(errs, 'comment_depth')}</div> : null}
          </label>

          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              name="enable_llm"
              checked={state.enable_llm}
              onChange={(e) => setState({ ...state, enable_llm: e.target.checked })}
            />
            <span>启用 LLM</span>
          </label>

          {state.enable_llm ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 220 }}>
                <span style={{ opacity: 0.85 }}>model</span>
                <input
                  aria-label="LLM model"
                  name="llm_model"
                  autoComplete="off"
                  value={state.llm_model}
                  onChange={(e) => setState({ ...state, llm_model: e.target.value })}
                  placeholder="例如：gpt-4.1-mini…"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid #303030',
                    background: '#141414',
                    color: '#f0f0f0',
                  }}
                />
                {errorText(errs, 'llm_model') ? <div style={{ color: '#ff7875' }}>{errorText(errs, 'llm_model')}</div> : null}
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 320 }}>
                <span style={{ opacity: 0.85 }}>base-url</span>
                <input
                  aria-label="LLM base url"
                  name="llm_base_url"
                  autoComplete="off"
                  value={state.llm_base_url}
                  onChange={(e) => setState({ ...state, llm_base_url: e.target.value })}
                  placeholder="例如：https://api.openai.com/v1…"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid #303030',
                    background: '#141414',
                    color: '#f0f0f0',
                  }}
                />
                {errorText(errs, 'llm_base_url') ? <div style={{ color: '#ff7875' }}>{errorText(errs, 'llm_base_url')}</div> : null}
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 320 }}>
                <span style={{ opacity: 0.85 }}>api-key（可用环境变量替代）</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    aria-label="LLM api key"
                    name="llm_api_key"
                    autoComplete="off"
                    type={showKey ? 'text' : 'password'}
                    value={state.llm_api_key}
                    onChange={(e) => setState({ ...state, llm_api_key: e.target.value })}
                    placeholder="不落盘，仅用于本次任务…"
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid #303030',
                      background: '#141414',
                      color: '#f0f0f0',
                    }}
                  />
                  <button
                    type="button"
                    aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                    onClick={() => setShowKey((v) => !v)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid #303030',
                      background: '#111111',
                      color: '#f0f0f0',
                      cursor: 'pointer',
                    }}
                  >
                    {showKey ? '隐藏' : '显示'}
                  </button>
                </div>
              </label>
            </div>
          ) : null}
        </div>
      </details>

      <div style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
        预览参数：{built.args.join(' ')}
      </div>
    </div>
  )
}
