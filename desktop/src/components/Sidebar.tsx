type NavKey = 'run' | 'history' | 'settings'

type Props = {
  active: NavKey
  onChange: (next: NavKey) => void
}

const itemStyle = (active: boolean) => ({
  width: '100%',
  textAlign: 'left' as const,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #303030',
  background: active ? '#1a1a1a' : '#111111',
  color: '#f0f0f0',
  cursor: 'pointer',
})

export default function Sidebar({ active, onChange }: Props) {
  return (
    <div
      style={{
        width: 220,
        padding: 14,
        borderRight: '1px solid #262626',
        background: '#0f0f0f',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700, letterSpacing: 0.2, padding: '6px 6px 12px 6px' }}>OmniScraper</div>
      <button type="button" onClick={() => onChange('run')} style={itemStyle(active === 'run')}>
        任务
      </button>
      <button type="button" onClick={() => onChange('history')} style={itemStyle(active === 'history')}>
        历史
      </button>
      <button type="button" onClick={() => onChange('settings')} style={itemStyle(active === 'settings')}>
        设置
      </button>
      <div style={{ flex: 1 }} />
    </div>
  )
}
