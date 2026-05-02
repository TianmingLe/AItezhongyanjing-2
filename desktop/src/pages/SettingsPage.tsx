import { useMemo, useState } from 'react'

type Step = 'idle' | 'confirm1' | 'confirm2' | 'running' | 'result'

export default function SettingsPage() {
  const [step, setStep] = useState<Step>('idle')
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState('')
  const [actions, setActions] = useState<Array<{ type: string; message: string }>>([])

  const overlayStyle = useMemo(
    () => ({
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      padding: 16,
    }),
    [],
  )

  const dialogStyle = useMemo(
    () => ({
      width: 'min(560px, 100%)',
      background: '#0f0f0f',
      border: '1px solid #2a2a2a',
      borderRadius: 14,
      padding: 16,
      color: '#f0f0f0',
      boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
    }),
    [],
  )

  const buttonStyle = useMemo(
    () => ({
      padding: '10px 12px',
      borderRadius: 10,
      border: '1px solid #303030',
      background: '#111111',
      color: '#f0f0f0',
      cursor: 'pointer',
    }),
    [],
  )

  const dangerStyle = useMemo(
    () => ({
      ...buttonStyle,
      background: '#2a0f0f',
      borderColor: '#5a1d1d',
    }),
    [buttonStyle],
  )

  const start = () => {
    setError('')
    setActions([])
    setConfirmText('')
    setStep('confirm1')
  }

  const execute = async () => {
    setError('')
    setActions([])
    setStep('running')
    const res = await window.electronAPI.uninstallApp()
    if (!res.ok) {
      setError(res.error)
      setStep('result')
      return
    }
    setActions(res.actions)
    setStep('result')
  }

  return (
    <div style={{ padding: 18, color: '#f0f0f0' }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>设置</div>
      <div style={{ border: '1px solid #262626', borderRadius: 12, padding: 14, background: '#0d0d0d' }}>
        <div style={{ fontWeight: 650, marginBottom: 6 }}>一键卸载</div>
        <div style={{ color: '#bdbdbd', fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
          该操作会清理本机 OmniScraper 数据（runs/exports/resources）以及应用配置缓存，并引导你完成系统卸载。该操作不可撤销。
        </div>
        <button type="button" style={dangerStyle} onClick={start}>
          一键卸载
        </button>
        {error ? <div style={{ marginTop: 10, color: '#ffb4b4' }}>{error}</div> : null}
      </div>

      {step === 'confirm1' ? (
        <div style={overlayStyle}>
          <div style={dialogStyle}>
            <div style={{ fontWeight: 750, marginBottom: 8 }}>确认卸载（1/2）</div>
            <div style={{ color: '#cfcfcf', fontSize: 13, lineHeight: 1.6 }}>
              将执行：
              <ul style={{ marginTop: 8 }}>
                <li>删除 ~/OmniScraperExports（runs/exports/resources 等）</li>
                <li>清理应用配置与缓存（userData）</li>
                <li>退出应用，并打开系统卸载入口/说明</li>
              </ul>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button type="button" style={buttonStyle} onClick={() => setStep('idle')}>
                取消
              </button>
              <button type="button" style={dangerStyle} onClick={() => setStep('confirm2')}>
                继续
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 'confirm2' ? (
        <div style={overlayStyle}>
          <div style={dialogStyle}>
            <div style={{ fontWeight: 750, marginBottom: 8 }}>确认卸载（2/2）</div>
            <div style={{ color: '#cfcfcf', fontSize: 13, lineHeight: 1.6 }}>
              请输入 <span style={{ fontWeight: 800 }}>UNINSTALL</span> 以继续：
            </div>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              style={{
                marginTop: 10,
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #303030',
                background: '#0b0b0b',
                color: '#f0f0f0',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => {
                  setConfirmText('')
                  setStep('idle')
                }}
              >
                取消
              </button>
              <button type="button" style={dangerStyle} disabled={confirmText !== 'UNINSTALL'} onClick={execute}>
                执行卸载
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 'running' ? (
        <div style={overlayStyle}>
          <div style={dialogStyle}>
            <div style={{ fontWeight: 750, marginBottom: 8 }}>正在卸载</div>
            <div style={{ color: '#cfcfcf', fontSize: 13, lineHeight: 1.6 }}>正在清理数据并准备退出应用…</div>
          </div>
        </div>
      ) : null}

      {step === 'result' ? (
        <div style={overlayStyle}>
          <div style={dialogStyle}>
            <div style={{ fontWeight: 750, marginBottom: 8 }}>{error ? '卸载失败' : '卸载已启动'}</div>
            {error ? (
              <div style={{ color: '#ffb4b4', fontSize: 13, lineHeight: 1.6 }}>{error}</div>
            ) : (
              <div style={{ color: '#cfcfcf', fontSize: 13, lineHeight: 1.6 }}>
                已执行数据清理并将退出应用。若系统卸载入口未自动打开，请按提示手动卸载应用本体。
              </div>
            )}
            {!error && actions.length ? (
              <div style={{ marginTop: 12, borderTop: '1px solid #262626', paddingTop: 10 }}>
                {actions.map((a, i) => (
                  <div key={`${a.type}-${i}`} style={{ fontSize: 12.5, color: '#bdbdbd', lineHeight: 1.6 }}>
                    {a.message}
                  </div>
                ))}
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button type="button" style={buttonStyle} onClick={() => setStep('idle')}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

