import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (process.env.ELECTRON_NO_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  ipcMain.handle('ping', async () => 'pong')
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
