import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { startLogServer } from './logServer'
import { ProcessManager } from './processManager'
import { createResultsManager } from './resultsManager'
import { registerResultsIpc } from './ipc/resultsIpc'
import { createExportManager } from './exportManager'
import { registerExportIpc } from './ipc/exportIpc'
import { initTray } from './tray'
import { isStartTaskConfig } from '../shared/protocol'
import type { LogEvent, StatusEvent } from '../shared/protocol'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (process.env.ELECTRON_NO_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox')
}

let mainWindow: BrowserWindow | null = null
let teardown: (() => Promise<void>) | null = null
let quitRequested = false

async function createWindow() {
  const logServer = await startLogServer({ backlogMax: 1000 })
  const pm = new ProcessManager({
    pythonExecPath: process.env.MEDIA_CRAWLER_PYTHON,
    entryPath: process.env.MEDIA_CRAWLER_ENTRY,
  })

  const rm = createResultsManager({ homeDir: app.getPath('home'), overrideResultsRoot: process.env.OVERRIDE_RESULTS_ROOT })
  registerResultsIpc(rm)

  const preloadPath = path.join(__dirname, '../preload/index.cjs')
  const rendererIndexFile = path.join(__dirname, '../renderer/index.html')
  const getRendererDevUrl = () => process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL || null

  const em = createExportManager({
    resultsRoot: rm._internal.resultsRoot,
    runsRoot: rm._internal.runsRoot,
    exportsRoot: rm._internal.exportsRoot,
    getMainWindow: () => mainWindow,
    getRendererDevUrl,
    getRendererIndexFile: () => rendererIndexFile,
    preloadPath,
  })
  registerExportIpc(em)

  const e2eLogPath = process.env.E2E_LOG_PATH
  const appendE2e = (obj: unknown) => {
    if (!e2eLogPath) return
    try {
      fs.appendFileSync(e2eLogPath, `${JSON.stringify(obj)}\n`)
    } catch {
      // ignore
    }
  }

  if (process.env.E2E_WSINFO_PATH) {
    try {
      fs.writeFileSync(process.env.E2E_WSINFO_PATH, JSON.stringify({ wsUrl: logServer.wsUrl, token: logServer.token }))
    } catch {
      // ignore
    }
  }

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
    appendE2e({ source: 'pm', ev })
    if (ev.type === 'status') {
      if (ev.status === 'stopped') {
        try {
          new Notification({ title: 'OmniScraper', body: '任务已完成' }).show()
        } catch {
          // ignore
        }
      }
      if (ev.status === 'error') {
        try {
          new Notification({
            title: 'OmniScraper',
            body: ev.detail ? `任务失败：${ev.detail}` : '任务失败',
          }).show()
        } catch {
          // ignore
        }
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
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow = win

  const tray = initTray({
    getWindow: () => mainWindow,
    onQuit: () => {
      quitRequested = true
      app.quit()
    },
  })

  ipcMain.handle('ping', async () => 'pong')
  ipcMain.handle('task:getWsInfo', async () => ({ wsUrl: logServer.wsUrl, token: logServer.token }))
  ipcMain.handle('task:start', async (_e, cfg: unknown) => {
    if (!isStartTaskConfig(cfg)) return { ok: false, error: 'bad_config' }
    const res = await pm.startTask(cfg)
    if (res.ok && process.env.E2E_KILL9 === '1') {
      const pid = pm.getPid()
      if (pid) {
        setTimeout(() => {
          try {
            process.kill(pid, 'SIGKILL')
          } catch {
            // ignore
          }
        }, 1500)
      }
    }
    return res
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

  let hideNotified = false
  win.on('minimize', () => {
    win.hide()
    tray.rebuild()
    if (!hideNotified) {
      hideNotified = true
      tray.notifyMinimized()
    }
  })
  win.on('close', (e: Electron.Event) => {
    if (quitRequested) return
    e.preventDefault()
    win.hide()
    tray.rebuild()
    if (!hideNotified) {
      hideNotified = true
      tray.notifyMinimized()
    }
  })

  if (process.env.E2E_AUTORUN === '1') {
    setTimeout(() => {
      win.webContents
        .executeJavaScript(`document.querySelector('[data-testid="start-btn"]')?.click()`, true)
        .catch(() => undefined)
    }, 2000)
    setTimeout(() => {
      win.webContents
        .executeJavaScript(`document.querySelector('[data-testid="ws-drop-btn"]')?.click()`, true)
        .catch(() => undefined)
    }, 10000)
    setTimeout(() => {
      win.webContents
        .executeJavaScript(`document.querySelector('[data-testid="stop-btn"]')?.click()`, true)
        .catch(() => undefined)
    }, 20000)
    setTimeout(() => {
      app.quit()
    }, 28000)
  }

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
