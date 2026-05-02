import { useEffect, useMemo, useRef, useState } from 'react'

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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const [following, setFollowing] = useState(true)
  const [newCount, setNewCount] = useState(0)

  const isNearBottom = () => {
    const el = containerRef.current
    if (!el) return true
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    return gap < 48
  }

  useEffect(() => {
    if (following && isNearBottom()) {
      bottomRef.current?.scrollIntoView({ block: 'end' })
      setNewCount(0)
    } else {
      setNewCount((c) => c + 1)
    }
  }, [items.length])

  const jumpToBottom = () => {
    setFollowing(true)
    setNewCount(0)
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }

  const onScroll = () => {
    if (isNearBottom()) {
      setFollowing(true)
      setNewCount(0)
    } else {
      setFollowing(false)
    }
  }

  const rows = useMemo(
    () =>
      items.map((it) => {
        const key =
          it.type === 'log'
            ? `log|${it.timestamp}|${it.level}|${it.module ?? ''}|${it.message}|${it.stream}`
            : `status|${it.timestamp}|${it.status}|${it.detail ?? ''}`
        return { it, key }
      }),
    [items],
  )

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
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
      {newCount > 0 && !following ? (
        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={jumpToBottom}
            aria-label="跳转到最新日志"
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid #303030',
              background: '#111111',
              color: '#f0f0f0',
              cursor: 'pointer',
            }}
          >
            {newCount} 条新日志
          </button>
        </div>
      ) : null}

      {rows.map(({ it, key }) => {
        if (it.type === 'status') {
          return (
            <div key={key} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 6 }}>
              <span style={{ opacity: 0.55, marginRight: 10 }}>{formatTimestamp(it.timestamp)}</span>
              <span style={{ color: '#9254de', marginRight: 10 }}>[{it.status.toUpperCase()}]</span>
              <span>{it.detail ?? ''}</span>
            </div>
          )
        }
        return (
          <div key={key} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 6 }}>
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
