import { useEffect, useState } from 'react'

import type { RunMeta } from '@shared/runs'

import HistoryList from '@/components/HistoryList'
import ReportPreview from '@/components/ReportPreview'

export default function HistoryPage() {
  const [items, setItems] = useState<RunMeta[]>([])
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [markdown, setMarkdown] = useState<string>('')
  const [error, setError] = useState<string>('')

  const refresh = async () => {
    setError('')
    const res = await window.electronAPI.listRuns()
    if (!res.ok) {
      setError(res.error)
      setItems([])
      return
    }
    setItems(res.items)
  }

  const select = async (runId: string) => {
    setSelected(runId)
    setMarkdown('')
    const res = await window.electronAPI.readRunReport(runId)
    if (!res.ok) {
      setMarkdown(`无法读取报告：${res.error}`)
      return
    }
    setMarkdown(res.markdown)
  }

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex' }}>
      <HistoryList items={items} selectedRunId={selected} onSelect={select} onRefresh={refresh} error={error} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <ReportPreview runId={selected} markdown={markdown || '请选择一个任务'} />
      </div>
    </div>
  )
}
