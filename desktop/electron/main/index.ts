import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { startLogServer } from './logServer'
import { ProcessManager } from './processManager'
import { isStartTaskConfig } from '../shared/protocol'
import type { LogEvent, StatusEvent } from '../shared/protocol'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (process.env.ELECTRON_NO_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox')
}

let mainWindow: BrowserWindow | null = null
let teardown: (() => Promise<void>) | null = null

async function createWindow() {
  const logServer = await startLogServer({ backlogMax: 1000 })
  const pm = new ProcessManager()

  const off = pm.onEvent((ev) => {
    // Primary: broadcast via local WebSocket to support renderer reconnect + backlog.
    logServer.broadcast(ev as LogEvent | StatusEvent)
    // Fallback: also deliver via Electron IPC (does not replace WS).
    if (mainWindow) {
      try {
        mainWindow.webContents.send('log:event', ev)
      } catch {
        // ignore
      }
    }
  })

  teardown = async () => {
    off()
    await pm.stopTask()
    await logServer.close()
  }

  const win = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow = win

  ipcMain.handle('ping', async () => 'pong')
  ipcMain.handle('task:getWsInfo', async () => ({ wsUrl: logServer.wsUrl, token: logServer.token }))
  ipcMain.handle('task:start', async (_e, cfg: unknown) => {
    if (!isStartTaskConfig(cfg)) return { ok: false, error: 'bad_config' }
    return pm.startTask(cfg)
  })
  ipcMain.handle('task:stop', async () => pm.stopTask())

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(JSON.stringify({ event: 'renderer_console', level, message, line, sourceId }, null, 0))
  })
  win.webContents.on('did-finish-load', async () => {
    try {
      const h1 = await win.webContents.executeJavaScript(
        "new Promise((r) => { let i = 0; const id = setInterval(() => { const v = document.querySelector('h1')?.textContent || ''; if (v || i >= 50) { clearInterval(id); r(v); } i += 1; }, 200); })",
        true,
      )
      console.log(JSON.stringify({ event: 'renderer_ready', h1 }, null, 0))
    } catch {
      console.log(JSON.stringify({ event: 'renderer_ready', h1: '' }, null, 0))
    }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', async (e) => {
  if (teardown) {
    e.preventDefault()
    const fn = teardown
    teardown = null
    try {
      await fn()
    } finally {
      app.quit()
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
