import { app, ipcMain, shell } from 'electron'

import type { createResultsManager } from '../resultsManager'
import { isUninstallRequest } from '../../shared/protocol'

import { performUninstall } from '../uninstallCore'

let registered = false

export const registerUninstallIpc = (rm: ReturnType<typeof createResultsManager>) => {
  if (registered) return
  registered = true

  ipcMain.handle('app:uninstall', async (_e, payload: unknown) => {
    if (!isUninstallRequest(payload)) return { ok: false, error: 'bad_payload' }
    try {
      const rr = await rm.getResultsRoot()
      if (!rr.ok) return { ok: false, error: rr.error }
      const resultsRoot = rr.path
      const userDataDir = app.getPath('userData')
      const homeDir = app.getPath('home')
      const exePath = app.getPath('exe')

      const actions = await performUninstall({
        homeDir,
        resultsRoot,
        userDataDir,
        platform: process.platform,
        exePath,
        openPath: async (p) => {
          await shell.openPath(p)
        },
        showItemInFolder: async (p) => {
          shell.showItemInFolder(p)
        },
        openExternal: async (u) => {
          await shell.openExternal(u)
        },
      })

      setTimeout(() => app.quit(), 1200)
      return { ok: true, actions }
    } catch (e) {
      return { ok: false, error: String(e).replace(/^Error:\s*/g, '') }
    }
  })
}
