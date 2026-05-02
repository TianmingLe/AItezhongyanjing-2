import { useMemo, useState } from 'react'

import type { ExportFormat } from '@shared/export'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

import { exportRun } from '@/services/exportService'

type Props = {
  runId?: string
  markdown: string
  canRerun?: boolean
  onRerun?: () => void
}

export default function ReportPreview({ runId, markdown, canRerun, onRerun }: Props) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const [message, setMessage] = useState<string>('')

  const render = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {markdown}
      </ReactMarkdown>
    ),
    [markdown],
  )

  const doExport = async (format: ExportFormat) => {
    if (!runId) return
    setMessage('')
    setExporting(format)
    try {
      const res = await exportRun(runId, format)
      if (!res.ok) {
        if (res.error === 'canceled') {
          setMessage('已取消导出')
        } else {
          setMessage(`导出失败：${res.error}`)
        }
        return
      }
      setMessage(`已导出：${res.path}`)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 14, borderBottom: '1px solid #262626', background: '#101010', color: '#f0f0f0' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>报告预览</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          中文显示取决于系统字体，若缺字请使用 Markdown 导出
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onRerun?.()}
            disabled={!canRerun || exporting !== null}
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: '1px solid #303030',
              background: '#111111',
              color: '#f0f0f0',
              cursor: !canRerun || exporting !== null ? 'not-allowed' : 'pointer',
            }}
          >
            重新运行
          </button>
          <button
            type="button"
            onClick={() => doExport('markdown')}
            disabled={!runId || exporting !== null}
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: '1px solid #303030',
              background: '#111111',
              color: '#f0f0f0',
              cursor: !runId || exporting !== null ? 'not-allowed' : 'pointer',
            }}
          >
            导出 Markdown
          </button>
          <button
            type="button"
            onClick={() => doExport('pdf')}
            disabled={!runId || exporting !== null}
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: '1px solid #303030',
              background: '#111111',
              color: '#f0f0f0',
              cursor: !runId || exporting !== null ? 'not-allowed' : 'pointer',
            }}
          >
            导出 PDF
          </button>
          <button
            type="button"
            onClick={() => doExport('json')}
            disabled={!runId || exporting !== null}
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: '1px solid #303030',
              background: '#111111',
              color: '#f0f0f0',
              cursor: !runId || exporting !== null ? 'not-allowed' : 'pointer',
            }}
          >
            导出 JSON
          </button>
          {message ? <div style={{ fontSize: 12, opacity: 0.85 }}>{message}</div> : null}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 16, background: '#141414', color: '#f0f0f0' }}>
        <style>{`
          pre { background: #0f0f0f; border: 1px solid #262626; border-radius: 10px; padding: 12px; overflow: auto; }
          code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #262626; padding: 6px 8px; }
        `}</style>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>{render}</div>
      </div>
    </div>
  )
}
