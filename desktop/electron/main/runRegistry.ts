import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type { RunMeta, RunStatus } from '../shared/runs'

type Options = {
  runsRoot: string
}

type CreateInput = {
  platform?: RunMeta['platform']
  mode?: RunMeta['mode']
  cli_args: string[]
}

type FinalizeInput = {
  status: Exclude<RunStatus, 'unknown' | 'running'>
  error_message?: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')

const formatRunIdPrefix = (ms: number) => {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const mm = pad2(d.getMinutes())
  const ss = pad2(d.getSeconds())
  return `${y}${m}${day}_${hh}${mm}${ss}`
}

const random6 = () => Math.random().toString(36).slice(2, 8)

export const createRunRegistry = (opts: Options) => {
  const createRun = async (input: CreateInput) => {
    const now = Date.now()
    const runId = `${formatRunIdPrefix(now)}_${input.platform ?? 'na'}_${input.mode ?? 'na'}_${random6()}`
    const runDir = path.join(opts.runsRoot, runId)
    await fs.mkdir(runDir, { recursive: true })

    const meta: RunMeta = {
      run_id: runId,
      created_at_ms: now,
      started_at_ms: now,
      status: 'running',
      platform: input.platform,
      mode: input.mode,
      cli_args: input.cli_args,
    }
    await fs.writeFile(path.join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8')
    return { runId, runDir, startedAtMs: now }
  }

  const finalizeRun = async (runId: string, input: FinalizeInput) => {
    const runDir = path.join(opts.runsRoot, runId)
    const metaPath = path.join(runDir, 'meta.json')
    const now = Date.now()
    let meta: any = null
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'))
    } catch {
      meta = { run_id: runId, created_at_ms: now, status: 'unknown' }
    }
    meta.finished_at_ms = now
    meta.status = input.status
    if (input.error_message) meta.error_message = input.error_message
    await fs.mkdir(runDir, { recursive: true })
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
  }

  const updateMeta = async (runId: string, patch: Partial<RunMeta>) => {
    const runDir = path.join(opts.runsRoot, runId)
    const metaPath = path.join(runDir, 'meta.json')
    let meta: any = null
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'))
    } catch {
      meta = { run_id: runId, created_at_ms: Date.now(), status: 'unknown' }
    }
    const next = { ...meta, ...patch }
    await fs.writeFile(metaPath, JSON.stringify(next, null, 2), 'utf-8')
  }

  return { createRun, finalizeRun, updateMeta }
}

