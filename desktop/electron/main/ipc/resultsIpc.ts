import { ipcMain } from 'electron'

import type { createResultsManager } from '../resultsManager'

let registered = false

export const registerResultsIpc = (rm: ReturnType<typeof createResultsManager>) => {
  if (registered) return
  registered = true

  ipcMain.handle('results:getRoot', async () => rm.getResultsRoot())
  ipcMain.handle('results:listRuns', async () => rm.listRuns())
  ipcMain.handle('results:readRunReport', async (_e, runId: unknown) => {
    if (typeof runId !== 'string') return { ok: false, error: 'bad_run_id' }
    return rm.readRunReport(runId)
  })
}

