import type { EventEnvelope, InitEvent, StartTaskConfig } from '@shared/protocol'

export {}

declare global {
  interface Window {
    electronAPI: {
      ping: () => Promise<string>
      startTask: (config: StartTaskConfig) => Promise<{ ok: boolean; error?: string }>
      stopTask: () => Promise<{ ok: boolean; error?: string }>
      onLog: (cb: (ev: EventEnvelope | InitEvent) => void) => () => void
      getLogStreamInfo: () => Promise<{ wsUrl: string; token: string }>
    }
  }
}

