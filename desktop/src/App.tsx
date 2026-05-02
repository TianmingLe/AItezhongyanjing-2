import { useEffect, useMemo, useState } from 'react'

import ResourceGate from '@/components/ResourceGate'
import Sidebar from '@/components/Sidebar'
import HistoryPage from '@/pages/HistoryPage'
import PrintPage from '@/pages/PrintPage'
import RunPage from '@/pages/RunPage'
import { ensureResources } from '@/services/resourceManager'
import { defaultTaskFormState, parseCliArgsToForm } from '@/utils/cliArgsParse'

type NavKey = 'run' | 'history'

export default function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const isPrint = params.get('print') === '1'
  if (isPrint) return <PrintPage />

  const [nav, setNav] = useState<NavKey>('run')
  const [form, setForm] = useState(defaultTaskFormState)
  const [autoStartNonce, setAutoStartNonce] = useState(0)
  const [resourcesPhase, setResourcesPhase] = useState<'checking' | 'downloading' | 'ready' | 'error'>('checking')
  const [resourcesPercent, setResourcesPercent] = useState(0)
  const [resourcesMessage, setResourcesMessage] = useState('检查资源')
  const [resourcesError, setResourcesError] = useState<string>('')

  useEffect(() => {
    let alive = true
    ensureResources((s) => {
      if (!alive) return
      setResourcesPhase(s.phase)
      setResourcesPercent(s.percent)
      setResourcesMessage(s.message)
    })
      .then((res) => {
        if (!alive) return
        if (!res.ok) {
          setResourcesPhase('error')
          setResourcesError(res.error)
        }
      })
      .catch((e) => {
        if (!alive) return
        setResourcesPhase('error')
        setResourcesError(String(e))
      })
    return () => {
      alive = false
    }
  }, [])

  const containerStyle = useMemo(
    () => ({
      height: '100vh',
      display: 'flex',
      background: '#0b0b0b',
    }),
    [],
  )

  if (resourcesPhase !== 'ready') {
    return (
      <ResourceGate
        phase={resourcesPhase}
        percent={resourcesPercent}
        message={resourcesMessage}
        error={resourcesError || undefined}
      />
    )
  }

  return (
    <div style={containerStyle}>
      <Sidebar active={nav} onChange={setNav} />
      <main style={{ flex: 1, minWidth: 0 }}>
        {nav === 'run' ? (
          <RunPage form={form} onChangeForm={setForm} autoStartNonce={autoStartNonce} />
        ) : (
          <HistoryPage
            onRerun={(cliArgs) => {
              setForm(parseCliArgsToForm(cliArgs, defaultTaskFormState()))
              setNav('run')
              setAutoStartNonce((n) => n + 1)
            }}
          />
        )}
      </main>
    </div>
  )
}
