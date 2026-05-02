import { ipcMain } from 'electron'

import type { createExportManager } from '../exportManager'
import { isExportRequest } from '../../shared/export'

let registered = false

export const registerExportIpc = (em: ReturnType<typeof createExportManager>) => {
  if (registered) return
  registered = true

  ipcMain.handle('export:save', async (_e, payload: unknown) => {
    if (!isExportRequest(payload)) return { ok: false, error: 'bad_payload' }
    return em.exportFile(payload.runId, payload.format)
  })
}

