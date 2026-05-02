import { useEffect, useRef } from 'react'

import type { EventEnvelope } from '@shared/protocol'

import { formatTimestamp } from '@/utils/logFormatter'

const colorByLevel = (level: string) => {
  switch (level) {
    case 'ERROR':
      return '#ff4d4f'
    case 'WARN':
      return '#faad14'
    case 'SUCCESS':
      return '#52c41a'
    case 'PROGRESS':
      return '#1890ff'
    case 'INFO':
      return '#f0f0f0'
    default:
      return '#8c8c8c'
  }
}

type Props = {
  items: EventEnvelope[]
}

export default function Terminal({ items }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [items.length])

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: 16,
        background: '#141414',
        color: '#f0f0f0',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      {items.map((it, idx) => {
        if (it.type === 'status') {
          return (
            <div key={idx} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 6 }}>
              <span style={{ opacity: 0.55, marginRight: 10 }}>{formatTimestamp(it.timestamp)}</span>
              <span style={{ color: '#9254de', marginRight: 10 }}>[{it.status.toUpperCase()}]</span>
              <span>{it.detail ?? ''}</span>
            </div>
          )
        }
        return (
          <div key={idx} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 6 }}>
            <span style={{ opacity: 0.55, marginRight: 10 }}>{formatTimestamp(it.timestamp)}</span>
            <span style={{ color: colorByLevel(it.level), marginRight: 10 }}>[{it.level}]</span>
            <span>{it.module ? `[${it.module}] ${it.message}` : it.message}</span>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

