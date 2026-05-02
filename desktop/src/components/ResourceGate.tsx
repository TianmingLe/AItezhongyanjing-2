import type { ResourcePhase } from '@shared/resources'

type Props = {
  phase: ResourcePhase
  percent: number
  message: string
  error?: string
}

const titleForPhase = (p: ResourcePhase) => {
  if (p === 'checking') return '环境初始化'
  if (p === 'downloading') return '环境初始化'
  if (p === 'ready') return '环境已就绪'
  return '环境初始化失败'
}

export default function ResourceGate({ phase, percent, message, error }: Props) {
  const bar = Math.max(0, Math.min(100, percent))
  return (
    <div style={{ height: '100vh', background: '#0f0f0f', color: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 520, padding: 18, border: '1px solid #262626', borderRadius: 16, background: '#101010' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{titleForPhase(phase)}</div>
        <div style={{ height: 10, background: '#1f1f1f', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${bar}%`, height: '100%', background: phase === 'error' ? '#ff4d4f' : '#6366f1' }} />
        </div>
        <div style={{ marginTop: 10, opacity: 0.9 }}>{message}</div>
        {error ? <div style={{ marginTop: 8, color: '#ff7875' }}>{error}</div> : null}
      </div>
    </div>
  )
}

