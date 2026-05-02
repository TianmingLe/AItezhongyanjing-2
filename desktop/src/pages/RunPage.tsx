import { useEffect, useRef, useState } from 'react'

import type { EventEnvelope, InitEvent, StartTaskConfig } from '@shared/protocol'
import { isEventEnvelope, isInitEvent } from '@shared/protocol'

import TaskConfig from '@/components/TaskConfig'
import Terminal from '@/components/Terminal'
import type { BuiltTask } from '@/utils/argsBuilder'
import { buildArgs, validateTask } from '@/utils/argsBuilder'
import type { TaskFormState } from '@/utils/argsBuilder'

type Props = {
  form: TaskFormState
  onChangeForm: (next: TaskFormState) => void
  autoStartNonce: number
}

export default function RunPage({ form, onChangeForm, autoStartNonce }: Props) {
  const [ping, setPing] = useState<string>('...')
  const [wsConnected, setWsConnected] = useState(false)
  const [items, setItems] = useState<EventEnvelope[]>([])
  const [busy, setBusy] = useState(false)
  const [runId, setRunId] = useState<string>('')

  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const stoppingRef = useRef(false)
  const seenRef = useRef<Set<string>>(new Set())
  const autoStartRef = useRef<number>(0)

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
    if (ev.type === 'status') {
      setBusy(ev.status === 'starting' || ev.status === 'running' || ev.status === 'stopping')
    }
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
        connectWs().catch(() => undefined)
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
              if (!seenRef.current.has(key)) seenRef.current.add(key)
            }
            const next = prev.concat(filtered)
            return next.length > 2000 ? next.slice(next.length - 2000) : next
          })
          return
        }
        if (isEventEnvelope(obj)) push(obj)
      } catch {
        // ignore
      }
    }
  }

  useEffect(() => {
    stoppingRef.current = false
    connectWs().catch(() => undefined)
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

  const start = async (built: BuiltTask) => {
    const config: StartTaskConfig = built.env ? { args: built.args, env: built.env } : { args: built.args }
    const res = await window.electronAPI.startTaskWithRun(config)
    if (res.ok) {
      setRunId(res.runId)
    } else {
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

  useEffect(() => {
    if (autoStartRef.current === autoStartNonce) return
    autoStartRef.current = autoStartNonce
    if (busy) return
    const errs = validateTask(form)
    if (errs.length) {
      push({ type: 'status', status: 'error', timestamp: Date.now(), detail: 'rerun_bad_config' })
      return
    }
    const built = buildArgs(form)
    start(built).catch(() => undefined)
  }, [autoStartNonce])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #262626', background: '#101010', color: '#f0f0f0' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
          <div style={{ opacity: 0.8 }}>ping: {ping}</div>
          <div style={{ opacity: 0.8 }}>ws: {wsConnected ? 'connected' : 'disconnected'}</div>
          {runId ? <div style={{ opacity: 0.8 }}>run: {runId}</div> : null}
        </div>
      </div>
      <TaskConfig busy={busy} onStart={start} onStop={stop} value={form} onChange={onChangeForm} />
      <Terminal items={items} />
    </div>
  )
}
