import * as path from 'node:path'
import * as fs from 'node:fs/promises'

import { ipcMain, type BrowserWindow } from 'electron'

import type { EnsureResourcesResult, ResourceProgressEvent } from '../../shared/resources'
import { isEnsureResourcesRequest } from '../../shared/resources'

import { setupResources } from '../resourceDownloader'
import { resolveManifestPath } from '../../../scripts/resolve-manifest-path'

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

  const mapError = (e: unknown) => {
    const msg = String(e || '')
    if (msg.includes('Resource download in progress by another instance')) return '资源正在被另一个实例下载，请稍后重试'
    if (msg.includes('disk_space_insufficient')) return '磁盘空间不足，请清理空间后重试'
    if (msg.includes('sha256_mismatch')) return '资源校验失败（SHA256 不一致），请重试或更换网络'
    if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN') || msg.includes('getaddrinfo')) return '网络不可达，请检查网络/代理设置'
    if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET')) return '网络连接失败或超时，请重试'
    if (msg.includes('http_')) return '下载失败（HTTP 错误），请重试'
    return msg.replace(/^Error:\s*/g, '')
  }

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
        manifestPath: resolveManifestPath({
          appRoot: opts.appRoot,
          platform: process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'darwin' : 'linux',
          arch: process.arch === 'arm64' ? 'arm64' : 'x64',
          env: process.env,
        }),
        onProgress: (ev) => sendProgress(win, ev),
      })
      await fs.writeFile(allReady, String(Date.now()), 'utf-8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: mapError(e) }
    }
  })
}
