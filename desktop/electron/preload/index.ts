import { contextBridge, ipcRenderer } from 'electron'

import type { EventEnvelope, InitEvent, StartTaskConfig } from '../shared/protocol'
import type { ListRunsResult, ReadRunReportResult, ResultsRootResult } from '../shared/runs'
import type { ExportRequest, ExportResult } from '../shared/export'
import type { StartWithRunRequest, StartWithRunResult } from '../shared/task'
import {
  parseIncomingEvent,
  parseListRunsResult,
  parseReadRunReportResult,
  parseResultsRootResult,
  parseExportRequest,
  parseExportResult,
  parseStartWithRunRequest,
  parseStartWithRunResult,
  parseStartStopResult,
  parseStartTaskConfig,
  parseWsInfo,
} from './validators'

const LOG_CHANNEL = 'log:event'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),

  getLogStreamInfo: async (): Promise<{ wsUrl: string; token: string }> => {
    const raw = await ipcRenderer.invoke('task:getWsInfo')
    const parsed = parseWsInfo(raw)
    if (!parsed) {
      throw new Error('bad_ws_info')
    }
    return parsed
  },

  startTask: async (config: StartTaskConfig): Promise<{ ok: boolean; error?: string }> => {
    const parsed = parseStartTaskConfig(config)
    if (!parsed) return { ok: false, error: 'bad_config' }
    const raw = await ipcRenderer.invoke('task:start', parsed)
    return parseStartStopResult(raw) ?? { ok: false, error: 'bad_response' }
  },

  startTaskWithRun: async (config: StartWithRunRequest): Promise<StartWithRunResult> => {
    const parsed = parseStartWithRunRequest(config)
    if (!parsed) return { ok: false, error: 'bad_config' }
    const raw = await ipcRenderer.invoke('task:startWithRun', parsed)
    return parseStartWithRunResult(raw) ?? { ok: false, error: 'bad_response' }
  },

  stopTask: async (): Promise<{ ok: boolean; error?: string }> => {
    const raw = await ipcRenderer.invoke('task:stop')
    return parseStartStopResult(raw) ?? { ok: true }
  },

  onLog: (cb: (ev: EventEnvelope | InitEvent) => void): (() => void) => {
    const handler = (_evt: unknown, payload: unknown) => {
      const parsed = parseIncomingEvent(payload)
      if (!parsed) return
      cb(parsed)
    }
    ipcRenderer.on(LOG_CHANNEL, handler as any)
    return () => {
      ipcRenderer.removeListener(LOG_CHANNEL, handler as any)
    }
  },

  getResultsRoot: async (): Promise<ResultsRootResult> => {
    const raw = await ipcRenderer.invoke('results:getRoot')
    return parseResultsRootResult(raw) ?? { ok: false, error: 'bad_response' }
  },

  listRuns: async (): Promise<ListRunsResult> => {
    const raw = await ipcRenderer.invoke('results:listRuns')
    return parseListRunsResult(raw) ?? { ok: false, error: 'bad_response' }
  },

  readRunReport: async (runId: string): Promise<ReadRunReportResult> => {
    const raw = await ipcRenderer.invoke('results:readRunReport', runId)
    return parseReadRunReportResult(raw) ?? { ok: false, error: 'bad_response' }
  },

  exportFile: async (req: ExportRequest): Promise<ExportResult> => {
    const parsed = parseExportRequest(req)
    if (!parsed) return { ok: false, error: 'bad_payload' }
    const raw = await ipcRenderer.invoke('export:save', parsed)
    return parseExportResult(raw) ?? { ok: false, error: 'bad_response' }
  },
})
