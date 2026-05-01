import { useEffect, useState } from 'react'

export default function App() {
  const [ping, setPing] = useState<string>('...')

  useEffect(() => {
    window.electronAPI.ping().then(setPing).catch(() => setPing('error'))
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', padding: 24 }}>
      <h1 style={{ margin: 0 }}>Hello Electron</h1>
      <p style={{ marginTop: 12 }}>ping: {ping}</p>
    </div>
  )
}

