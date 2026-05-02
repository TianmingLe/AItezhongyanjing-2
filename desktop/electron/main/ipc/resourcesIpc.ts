import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as readline from 'node:readline'
import * as fs from 'node:fs/promises'

import { ipcMain, type BrowserWindow } from 'electron'

import type { EnsureResourcesResult, ResourcePhase, ResourceProgressEvent } from '../../shared/resources'
import { isEnsureResourcesRequest } from '../../shared/resources'

type Options = {
  isPackaged: boolean
  resourcesPath: string
  appRoot: string
  resourcesRoot: string
  getMainWindow: () => BrowserWindow | null
}

let registered = false

const exists = async (p: string) => {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

const sendProgress = (win: BrowserWindow | null, ev: ResourceProgressEvent) => {
  if (!win) return
  try {
    win.webContents.send('resources:progress', ev)
  } catch {
    // ignore
  }
}

const resolveEnsureCommand = (opts: Options) => {
  const resourcesExe = path.join(
    opts.resourcesPath,
    'python',
    process.platform === 'win32' ? 'omni-backend.exe' : 'omni-backend',
  )
  if (opts.isPackaged) {
    return { cmd: resourcesExe, args: ['--setup-resources'] }
  }
  const python = process.env.MEDIA_CRAWLER_PYTHON || 'python3'
  const script = path.join(opts.appRoot, 'python_backend', 'omni_backend.py')
  return { cmd: python, args: ['-u', script, '--setup-resources'] }
}

const parseProgress = (line: string): { phase: ResourcePhase; percent?: number; message?: string } | null => {
  const m = /^\[(INFO|WARN|ERROR|SUCCESS|PROGRESS)\]\s+\[([^\]]+)\]\s+(.*)$/.exec(line.trim())
  if (!m) return { phase: 'downloading', message: line.trim() }
  const level = m[1]
  const msg = (m[3] || '').trim()
  if (level === 'ERROR') return { phase: 'error', message: msg }
  if (level === 'PROGRESS') {
    const p = /^(\d{1,3})%\s*(.*)$/.exec(msg)
    if (!p) return { phase: 'downloading', message: msg }
    const percent = Math.max(0, Math.min(100, Number(p[1])))
    const message = (p[2] || '').trim() || undefined
    const phase: ResourcePhase = percent >= 100 ? 'ready' : 'downloading'
    return { phase, percent, message }
  }
  return { phase: 'downloading', message: msg }
}

export const registerResourcesIpc = (opts: Options) => {
  if (registered) return
  registered = true

  ipcMain.handle('resources:ensure', async (_e, payload: unknown): Promise<EnsureResourcesResult> => {
    if (!isEnsureResourcesRequest(payload)) return { ok: false, error: 'bad_payload' }

    const win = opts.getMainWindow()
    const resourcesRoot = opts.resourcesRoot
    const playwrightDir = path.join(resourcesRoot, 'playwright-browsers')
    const modelsDir = path.join(resourcesRoot, 'models')
    const modelsReady = path.join(modelsDir, '.ready')

    await fs.mkdir(resourcesRoot, { recursive: true })
    await fs.mkdir(playwrightDir, { recursive: true })
    await fs.mkdir(modelsDir, { recursive: true })

    if (await exists(modelsReady)) {
      sendProgress(win, { type: 'resources', phase: 'ready', percent: 100, message: '已就绪' })
      return { ok: true }
    }

    sendProgress(win, { type: 'resources', phase: 'checking', percent: 0, message: '检查资源' })

    const { cmd, args } = resolveEnsureCommand(opts)
    const env: Record<string, string> = {
      ...process.env,
      OMNI_RESOURCES_DIR: resourcesRoot,
      PLAYWRIGHT_BROWSERS_PATH: playwrightDir,
      OMNI_MODELS_DIR: modelsDir,
      PYTHONUNBUFFERED: '1',
    } as any

    return await new Promise<EnsureResourcesResult>((resolve) => {
      let resolved = false
      let lastPhase: ResourcePhase = 'downloading'
      const child = spawn(cmd, args, { env, stdio: 'pipe' })
      const rlOut = readline.createInterface({ input: child.stdout })
      const rlErr = readline.createInterface({ input: child.stderr })

      const onLine = (line: string) => {
        const parsed = parseProgress(line)
        if (!parsed) return
        lastPhase = parsed.phase
        sendProgress(win, { type: 'resources', phase: parsed.phase, percent: parsed.percent, message: parsed.message })
      }

      rlOut.on('line', onLine)
      rlErr.on('line', onLine)

      child.on('error', (e) => {
        if (resolved) return
        resolved = true
        sendProgress(win, { type: 'resources', phase: 'error', message: String(e) })
        resolve({ ok: false, error: String(e) })
      })

      child.on('exit', async (code) => {
        rlOut.close()
        rlErr.close()
        if (resolved) return
        resolved = true
        if (code === 0) {
          try {
            await fs.writeFile(modelsReady, 'ok', 'utf-8')
          } catch {
            // ignore
          }
          sendProgress(win, { type: 'resources', phase: 'ready', percent: 100, message: '已就绪' })
          resolve({ ok: true })
        } else {
          const msg = `exit:${code ?? 'null'}`
          sendProgress(win, { type: 'resources', phase: 'error', message: msg })
          resolve({ ok: false, error: lastPhase === 'error' ? 'setup_failed' : msg })
        }
      })
    })
  })
}

