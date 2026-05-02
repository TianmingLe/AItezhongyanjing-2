import type { RunMeta } from '@shared/runs'

type Props = {
  items: RunMeta[]
  selectedRunId?: string
  onSelect: (runId: string) => void
  onRefresh: () => Promise<void>
  error?: string
}

const statusBadge = (status: RunMeta['status']) => {
  if (status === 'success') return { text: '成功', color: '#52c41a' }
  if (status === 'failed') return { text: '失败', color: '#ff4d4f' }
  if (status === 'stopped') return { text: '已停止', color: '#faad14' }
  if (status === 'running') return { text: '运行中', color: '#1890ff' }
  return { text: '未知', color: '#8c8c8c' }
}

export default function HistoryList({ items, selectedRunId, onSelect, onRefresh, error }: Props) {
  return (
    <div style={{ width: 360, borderRight: '1px solid #262626', background: '#0f0f0f', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 14, borderBottom: '1px solid #262626', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 700, color: '#f0f0f0' }}>历史任务</div>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          aria-label="刷新历史任务"
          onClick={() => onRefresh()}
          style={{
            padding: '8px 10px',
            borderRadius: 10,
            border: '1px solid #303030',
            background: '#111111',
            color: '#f0f0f0',
            cursor: 'pointer',
          }}
        >
          刷新
        </button>
      </div>

      {error ? <div style={{ padding: 14, color: '#ff7875' }}>{error}</div> : null}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {items.length === 0 ? <div style={{ padding: 14, color: '#8c8c8c' }}>暂无任务</div> : null}
        {items.map((it) => {
          const active = it.run_id === selectedRunId
          const badge = statusBadge(it.status)
          const title = it.platform
            ? it.mode === 'search'
              ? `${it.platform} · ${it.keyword ?? ''}`
              : `${it.platform} · ${it.specified_id ?? ''}`
            : it.run_id
          return (
            <button
              key={it.run_id}
              type="button"
              onClick={() => onSelect(it.run_id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: 12,
                border: 'none',
                borderBottom: '1px solid #1f1f1f',
                background: active ? '#141414' : '#0f0f0f',
                color: '#f0f0f0',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ color: badge.color, fontWeight: 700, minWidth: 48 }}>{badge.text}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                  {it.warning ? <div style={{ fontSize: 12, color: '#faad14' }}>{it.warning}</div> : null}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

