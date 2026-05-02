import { Menu, nativeImage, Notification, Tray, type BrowserWindow } from 'electron'

type Options = {
  getWindow: () => BrowserWindow | null
  onQuit: () => void
}

const trayIcon = () => {
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect x="0" y="0" width="64" height="64" rx="14" fill="#111111"/>
      <circle cx="32" cy="32" r="14" fill="#6366f1"/>
    </svg>`,
  )
  return nativeImage.createFromDataURL(`data:image/svg+xml,${svg}`)
}

export const initTray = ({ getWindow, onQuit }: Options) => {
  const tray = new Tray(trayIcon())

  const rebuild = () => {
    const win = getWindow()
    const visible = Boolean(win && win.isVisible())
    const menu = Menu.buildFromTemplate([
      {
        label: visible ? '隐藏窗口' : '显示窗口',
        click: () => {
          const w = getWindow()
          if (!w) return
          if (w.isVisible()) w.hide()
          else {
            w.show()
            w.focus()
          }
        },
      },
      { type: 'separator' },
      { label: '退出应用', click: () => onQuit() },
    ])
    tray.setContextMenu(menu)
    tray.setToolTip('OmniScraper')
  }

  rebuild()
  tray.on('click', () => rebuild())
  tray.on('right-click', () => rebuild())

  const notifyMinimized = () => {
    try {
      new Notification({ title: 'OmniScraper', body: '已最小化到托盘' }).show()
    } catch {
      // ignore
    }
  }

  return { tray, rebuild, notifyMinimized }
}

