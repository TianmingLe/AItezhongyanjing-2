import { useEffect, useMemo, useRef, useState } from 'react'

import type { EventEnvelope, InitEvent, StartTaskConfig } from '@shared/protocol'
import { isEventEnvelope, isInitEvent } from '@shared/protocol'

import Terminal from '@/components/Terminal'

export default function App() {
  const [ping, setPing] = useState<string>('...')
  const [wsConnected, setWsConnected] = useState(false)
  const [items, setItems] = useState<EventEnvelope[]>([])
  const [specifiedId, setSpecifiedId] = useState('test-id')

  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const stoppingRef = useRef(false)
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    window.electronAPI.ping().then(setPing).catch(() => setPing('error'))
  }, [])

  const push = (ev: EventEnvelope) => {
    const key =
      ev.type === 'log'
        ? `log|${ev.timestamp}|${ev.level}|${ev.module ?? ''}|${ev.message}|${ev.stream}`
        : `status|${ev.timestamp}|${ev.status}|${ev.detail ?? ''}`
    if (seenRef.current.has(key)) return
    seenRef.current.add(key)
    if (seenRef.current.size > 5000) {
      const keep = new Set(Array.from(seenRef.current).slice(-3000))
      seenRef.current = keep
    }
    setItems((prev) => {
      const next = prev.concat(ev)
      return next.length > 2000 ? next.slice(next.length - 2000) : next
    })
  }

  useEffect(() => {
    const off = window.electronAPI.onLog((ev) => {
      if (wsConnected) return
      if (ev.type === 'init') return
      push(ev)
    })
    return () => off()
  }, [wsConnected])

  const connectWs = async () => {
    const { wsUrl, token } = await window.electronAPI.getLogStreamInfo()
    const url = `${wsUrl}?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      retryRef.current = 0
      setWsConnected(true)
    }
    ws.onclose = () => {
      setWsConnected(false)
      wsRef.current = null
      if (stoppingRef.current) return
      const n = retryRef.current++
      const delay = Math.min(250 * 2 ** n, 2000)
      window.setTimeout(() => {
        connectWs().catch(() => {
          // ignore
        })
      }, delay)
    }
    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
    ws.onmessage = (msg) => {
      try {
        const obj = JSON.parse(String(msg.data)) as unknown
        if (isInitEvent(obj)) {
          const init = obj as InitEvent
          setItems((prev) => {
            const filtered = init.backlog.filter(isEventEnvelope)
            for (const e of filtered) {
              const key =
                e.type === 'log'
                  ? `log|${e.timestamp}|${e.level}|${e.module ?? ''}|${e.message}|${e.stream}`
                  : `status|${e.timestamp}|${e.status}|${e.detail ?? ''}`
              if (!seenRef.current.has(key)) {
                seenRef.current.add(key)
              }
            }
            const next = prev.concat(filtered)
            return next.length > 2000 ? next.slice(next.length - 2000) : next
          })
          return
        }
        if (isEventEnvelope(obj)) {
          push(obj)
        }
      } catch {
        // ignore
      }
    }
  }

  useEffect(() => {
    stoppingRef.current = false
    connectWs().catch(() => {
      // ignore
    })
    return () => {
      stoppingRef.current = true
      try {
        wsRef.current?.close()
      } catch {
        // ignore
      }
      wsRef.current = null
    }
  }, [])

  const start = async () => {
    const config: StartTaskConfig = {
      args: ['--platform', 'dy', '--pipeline', 'mvp', '--specified_id', specifiedId],
    }
    const res = await window.electronAPI.startTask(config)
    if (!res.ok) {
      push({ type: 'status', status: 'error', timestamp: Date.now(), detail: res.error ?? 'start_failed' })
    }
  }

  const stop = async () => {
    const res = await window.electronAPI.stopTask()
    if (!res.ok) {
      push({ type: 'status', status: 'error', timestamp: Date.now(), detail: res.error ?? 'stop_failed' })
    } else {
      push({ type: 'log', level: 'SUCCESS', timestamp: Date.now(), message: '任务已终止', stream: 'stdout' })
    }
  }

  const startCrash = async () => {
    const config: StartTaskConfig = {
      args: ['--platform', 'dy', '--pipeline', 'mvp', '--specified_id', specifiedId, '--crash'],
    }
    const res = await window.electronAPI.startTask(config)
    if (!res.ok) {
      push({ type: 'status', status: 'error', timestamp: Date.now(), detail: res.error ?? 'start_failed' })
    }
  }

  const dropWs = () => {
    try {
      wsRef.current?.close()
    } catch {
      // ignore
    }
  }

  const headerStyle = useMemo(
    () => ({
      fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      padding: 16,
      borderBottom: '1px solid #303030',
      display: 'flex',
      gap: 12,
      alignItems: 'center',
      background: '#111111',
      color: '#f0f0f0',
    }),
    [],
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={headerStyle}>
        <div style={{ fontWeight: 600 }}>Desktop</div>
        <div style={{ opacity: 0.8 }}>ping: {ping}</div>
        <div style={{ opacity: 0.8 }}>ws: {wsConnected ? 'connected' : 'disconnected'}</div>
        <input
          value={specifiedId}
          onChange={(e) => setSpecifiedId(e.target.value)}
          placeholder="specified_id"
          style={{
            width: 220,
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #303030',
            background: '#141414',
            color: '#f0f0f0',
          }}
        />
        <div style={{ flex: 1 }} />
        <button data-testid="start-btn" onClick={start} style={{ padding: '6px 10px' }}>
          Start
        </button>
        <button data-testid="stop-btn" onClick={stop} style={{ padding: '6px 10px' }}>
          Stop
        </button>
        <button data-testid="crash-btn" onClick={startCrash} style={{ padding: '6px 10px' }}>
          Start Crash
        </button>
        <button data-testid="ws-drop-btn" onClick={dropWs} style={{ padding: '6px 10px' }}>
          WS 断线
        </button>
      </div>

      <Terminal items={items} />
    </div>
  )
}
