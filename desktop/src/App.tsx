import { useEffect, useMemo, useRef, useState } from 'react'

import type { EventEnvelope, InitEvent, StartTaskConfig } from '@shared/protocol'
import { isEventEnvelope, isInitEvent } from '@shared/protocol'

import Terminal from '@/components/Terminal'

export default function App() {
  const [ping, setPing] = useState<string>('...')
  const [wsConnected, setWsConnected] = useState(false)
  const [items, setItems] = useState<EventEnvelope[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const stoppingRef = useRef(false)

  useEffect(() => {
    window.electronAPI.ping().then(setPing).catch(() => setPing('error'))
  }, [])

  const push = (ev: EventEnvelope) => {
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
            const next = prev.concat(init.backlog.filter(isEventEnvelope))
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
    const config: StartTaskConfig = { args: [] }
    const res = await window.electronAPI.startTask(config)
    if (!res.ok) {
      push({ type: 'status', status: 'idle', timestamp: Date.now(), detail: res.error ?? 'start_failed' })
    }
  }

  const stop = async () => {
    const res = await window.electronAPI.stopTask()
    if (!res.ok) {
      push({ type: 'status', status: 'idle', timestamp: Date.now(), detail: res.error ?? 'stop_failed' })
    } else {
      push({ type: 'log', level: 'SUCCESS', timestamp: Date.now(), message: '任务已终止', stream: 'stdout' })
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
        <div style={{ flex: 1 }} />
        <button onClick={start} style={{ padding: '6px 10px' }}>
          Start
        </button>
        <button onClick={stop} style={{ padding: '6px 10px' }}>
          Stop
        </button>
      </div>

      <Terminal items={items} />
    </div>
  )
}
