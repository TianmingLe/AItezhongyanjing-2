import type { ExportFormat } from '@shared/export'

export const exportRun = async (runId: string, format: ExportFormat): Promise<{ ok: true; path: string } | { ok: false; error: string }> =>
  window.electronAPI.exportFile({ runId, format })

