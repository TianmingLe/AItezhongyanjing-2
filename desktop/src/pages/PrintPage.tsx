import { useEffect, useMemo, useState } from 'react'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export default function PrintPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const runId = params.get('runId') || ''
  const [markdown, setMarkdown] = useState<string>('Loading…')

  useEffect(() => {
    if (!runId) {
      setMarkdown('Missing runId')
      return
    }
    window.electronAPI
      .readRunReport(runId)
      .then((res) => {
        if (!res.ok) {
          setMarkdown(`readRunReport failed: ${res.error}`)
          return
        }
        setMarkdown(res.markdown)
      })
      .catch((e) => setMarkdown(`readRunReport failed: ${String(e)}`))
  }, [runId])

  return (
    <div style={{ padding: 28, background: '#ffffff', color: '#111111' }}>
      <style>{`
        @page { size: A4; margin: 10mm; }
        pre { white-space: pre-wrap; word-break: break-word; }
        code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      `}</style>
      <div style={{ maxWidth: 860, margin: '0 auto', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  )
}

