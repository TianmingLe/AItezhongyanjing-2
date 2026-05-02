import { useMemo, useState } from 'react'

import Sidebar from '@/components/Sidebar'
import HistoryPage from '@/pages/HistoryPage'
import PrintPage from '@/pages/PrintPage'
import RunPage from '@/pages/RunPage'

type NavKey = 'run' | 'history'

export default function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const isPrint = params.get('print') === '1'
  if (isPrint) return <PrintPage />

  const [nav, setNav] = useState<NavKey>('run')

  const containerStyle = useMemo(
    () => ({
      height: '100vh',
      display: 'flex',
      background: '#0b0b0b',
    }),
    [],
  )

  return (
    <div style={containerStyle}>
      <Sidebar active={nav} onChange={setNav} />
      <main style={{ flex: 1, minWidth: 0 }}>
        {nav === 'run' ? <RunPage /> : <HistoryPage />}
      </main>
    </div>
  )
}
