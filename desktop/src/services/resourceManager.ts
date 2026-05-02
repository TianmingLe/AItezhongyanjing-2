import type { ResourcePhase, ResourceProgressEvent } from '@shared/resources'

export type ResourceState = {
  phase: ResourcePhase
  percent: number
  message: string
}

export const ensureResources = async (onProgress: (s: ResourceState) => void): Promise<{ ok: true } | { ok: false; error: string }> => {
  let last: ResourceState = { phase: 'checking', percent: 0, message: '检查资源' }
  onProgress(last)

  const off = window.electronAPI.onResourcesProgress((ev: ResourceProgressEvent) => {
    const percent = typeof ev.percent === 'number' ? ev.percent : last.percent
    const message = ev.message ?? last.message
    last = { phase: ev.phase, percent, message }
    onProgress(last)
  })

  try {
    const res = await window.electronAPI.ensureResources()
    if (!res.ok) return { ok: false, error: res.error }
    onProgress({ phase: 'ready', percent: 100, message: '已就绪' })
    return { ok: true }
  } finally {
    off()
  }
}

