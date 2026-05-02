import type { EventEnvelope, InitEvent, StartTaskConfig } from '@shared/protocol'
import type { ListRunsResult, ReadRunReportResult, ResultsRootResult } from '@shared/runs'
import type { ExportRequest, ExportResult } from '@shared/export'
import type { StartWithRunRequest, StartWithRunResult } from '@shared/task'

export {}

declare global {
  interface Window {
    electronAPI: {
      ping: () => Promise<string>
      startTask: (config: StartTaskConfig) => Promise<{ ok: boolean; error?: string }>
      stopTask: () => Promise<{ ok: boolean; error?: string }>
      onLog: (cb: (ev: EventEnvelope | InitEvent) => void) => () => void
      getLogStreamInfo: () => Promise<{ wsUrl: string; token: string }>
      getResultsRoot: () => Promise<ResultsRootResult>
      listRuns: () => Promise<ListRunsResult>
      readRunReport: (runId: string) => Promise<ReadRunReportResult>
      exportFile: (req: ExportRequest) => Promise<ExportResult>
      startTaskWithRun: (config: StartWithRunRequest) => Promise<StartWithRunResult>
    }
  }
}
