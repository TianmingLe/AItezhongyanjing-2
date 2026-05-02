import type { TaskStatus } from '../../electron/shared/protocol'

export type RunPageTab = 'terminal' | 'report'

export const nextActiveTab = (current: RunPageTab, status: TaskStatus): RunPageTab => {
  if (status === 'stopped') return 'report'
  return current
}

export const shouldLoadReport = (input: { status: TaskStatus | null; runId: string; hasReport: boolean; loading: boolean }) => {
  if (input.loading) return false
  if (input.hasReport) return false
  if (!input.runId) return false
  return input.status === 'stopped'
}

