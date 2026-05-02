import { contextBridge, ipcRenderer } from 'electron'

import type { EventEnvelope, InitEvent, StartTaskConfig } from '../shared/protocol'
import { parseIncomingEvent, parseStartStopResult, parseStartTaskConfig, parseWsInfo } from './validators'

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
})
