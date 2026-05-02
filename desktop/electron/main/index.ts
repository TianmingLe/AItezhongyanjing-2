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
import { registerResourcesIpc } from './ipc/resourcesIpc'
import { initTray } from './tray'
import { maybeCopyArtifacts } from './autoCopyRuns'
import { detectSupportsOutputDirArg } from './outputDirSupport'
import { createRunRegistry } from './runRegistry'
import { resolveBackend } from './backendPaths'
import { isStartTaskConfig } from '../shared/protocol'
import type { StartTaskConfig } from '../shared/protocol'
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
  const backend = resolveBackend({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, appRoot: app.getAppPath(), env: process.env })
  const pm =
    backend.mode === 'exe'
      ? new ProcessManager({ mode: 'exe', execPath: backend.execPath })
      : new ProcessManager({ mode: 'python', pythonExecPath: backend.pythonExecPath, entryPath: backend.entryPath })

  const rm = createResultsManager({ homeDir: app.getPath('home'), overrideResultsRoot: process.env.OVERRIDE_RESULTS_ROOT })
  registerResultsIpc(rm)
  const rr = createRunRegistry({ runsRoot: rm._internal.runsRoot })

  let currentRun:
    | {
        runId: string
        runDir: string
        startedAtMs: number
        stopRequested: boolean
      }
    | null = null

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

  registerResourcesIpc({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appRoot: app.getAppPath(),
    homeDir: app.getPath('home'),
    resourcesRoot: path.join(rm._internal.resultsRoot, 'resources'),
    getMainWindow: () => mainWindow,
  })

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

      if ((ev.status === 'stopped' || ev.status === 'error') && currentRun) {
        const run = currentRun
        currentRun = null
        const finishedAtMs = Date.now()
        const defaultRunsRoot = process.env.MEDIA_CRAWLER_DEFAULT_RUNS_ROOT || '/workspace/MediaCrawler/results/runs'
        void (async () => {
          const status = run.stopRequested ? 'stopped' : ev.status === 'error' ? 'failed' : 'success'
          await rr.finalizeRun(run.runId, { status, error_message: ev.status === 'error' ? ev.detail : undefined })
          const copied = await maybeCopyArtifacts({
            runDir: run.runDir,
            startedAtMs: run.startedAtMs,
            finishedAtMs,
            defaultRunsRoot,
          })
          if (copied.ok && copied.sourceDir !== run.runDir) {
            await rr.updateMeta(run.runId, { warning: 'auto_copy_mode', copied_from: copied.sourceDir })
            emitSystemLog('WARN', '已启用自动复制模式（MediaCrawler 未写入指定输出目录）')
          } else if (!copied.ok) {
            emitSystemLog('WARN', `自动复制失败：${copied.error}`)
          }
        })()
      }
    }
  })

  const emitSystemLog = (level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'PROGRESS', message: string) => {
    const ev: LogEvent = {
      type: 'log',
      level,
      timestamp: Date.now(),
      module: 'desktop',
      message,
      stream: 'stdout',
    }
    logServer.broadcast(ev)
    if (mainWindow) {
      try {
        mainWindow.webContents.send('log:event', ev)
      } catch {
        // ignore
      }
    }
    appendE2e({ source: 'desktop', ev })
  }

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
  const parseRunFieldsFromArgs = (args: string[]) => {
    const get = (flag: string) => {
      const idx = args.indexOf(flag)
      if (idx === -1) return null
      return args[idx + 1] ?? null
    }
    const p = get('--platform')
    const specified_id = get('--specified_id')
    const keyword = get('--keyword')
    const limit = get('--limit')
    const mode: 'search' | 'detail' = keyword ? 'search' : 'detail'
    const platform: 'dy' | 'xhs' | 'bili' | undefined = p === 'dy' || p === 'xhs' || p === 'bili' ? p : undefined
    return {
      platform,
      mode,
      specified_id: typeof specified_id === 'string' ? specified_id : undefined,
      keyword: typeof keyword === 'string' ? keyword : undefined,
      limit: typeof limit === 'string' && Number.isFinite(Number(limit)) ? Number(limit) : undefined,
    }
  }

  const startWithRun = async (cfg: StartTaskConfig) => {
    const args = cfg.args
    const fields = parseRunFieldsFromArgs(args)
    const created = await rr.createRun({ platform: fields.platform, mode: fields.mode, cli_args: args })
    currentRun = { runId: created.runId, runDir: created.runDir, startedAtMs: created.startedAtMs, stopRequested: false }

    await rr.updateMeta(created.runId, fields)

    const env = { ...(cfg.env || {}), RESULTS_DIR: created.runDir }
    const supports =
      backend.mode === 'python'
        ? await detectSupportsOutputDirArg(backend.pythonExecPath, backend.entryPath)
        : await detectSupportsOutputDirArg(backend.execPath, '')
    const finalArgs = supports ? args.concat(['--output-dir', created.runDir]) : args
    const res = await pm.startTask({ args: finalArgs, cwd: cfg.cwd, env })
    if (!res.ok) {
      await rr.finalizeRun(created.runId, { status: 'failed', error_message: res.error })
      currentRun = null
      return { ok: false, error: res.error ?? 'start_failed' }
    }
    await rr.updateMeta(created.runId, { cli_args: finalArgs })
    return { ok: true, runId: created.runId, runDir: created.runDir }
  }

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
  ipcMain.handle('task:startWithRun', async (_e, cfg: unknown) => {
    if (!isStartTaskConfig(cfg)) return { ok: false, error: 'bad_config' }
    return startWithRun(cfg)
  })

  ipcMain.handle('task:stop', async () => {
    if (currentRun) currentRun.stopRequested = true
    return pm.stopTask()
  })

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
      startWithRun({ args: ['--platform', 'dy', '--pipeline', 'mvp', '--specified_id', 'e2e'] }).catch(() => undefined)
    }, 2000)
    setTimeout(() => {
      if (currentRun) currentRun.stopRequested = true
      pm.stopTask().catch(() => undefined)
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
  quitRequested = true
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
