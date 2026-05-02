import * as path from 'node:path'
import * as fs from 'node:fs/promises'

import { ipcMain, type BrowserWindow } from 'electron'

import type { EnsureResourcesResult, ResourceProgressEvent } from '../../shared/resources'
import { isEnsureResourcesRequest } from '../../shared/resources'

import { setupResources } from '../resourceDownloader'

type Options = {
  isPackaged: boolean
  resourcesPath: string
  appRoot: string
  homeDir: string
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

export const registerResourcesIpc = (opts: Options) => {
  if (registered) return
  registered = true

  ipcMain.handle('resources:ensure', async (_e, payload: unknown): Promise<EnsureResourcesResult> => {
    if (!isEnsureResourcesRequest(payload)) return { ok: false, error: 'bad_payload' }

    const win = opts.getMainWindow()
    const resourcesRoot = opts.resourcesRoot
    await fs.mkdir(resourcesRoot, { recursive: true })
    const allReady = path.join(resourcesRoot, '.ready')
    if (await exists(allReady)) return { ok: true }

    try {
      await setupResources({
        appRoot: opts.appRoot,
        homeDir: opts.homeDir,
        manifestPath: process.env.OMNI_MANIFEST_PATH || path.join(opts.appRoot, 'resources-manifest.json'),
        onProgress: (ev) => sendProgress(win, ev),
      })
      await fs.writeFile(allReady, String(Date.now()), 'utf-8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })
}
