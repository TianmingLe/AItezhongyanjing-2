import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type { ListRunsResult, ReadRunReportResult, ResultsRootResult, RunMeta } from '../shared/runs'
import { isRunMeta } from '../shared/runs'

type Options = {
  homeDir: string
  overrideResultsRoot?: string
}

const isSafeRunId = (v: string) => /^[A-Za-z0-9._-]{1,120}$/.test(v)

const runDirNameFallback = (dirName: string): Partial<RunMeta> => {
  const lower = dirName.toLowerCase()
  const platform = lower.includes('_dy_') ? 'dy' : lower.includes('_xhs_') ? 'xhs' : lower.includes('_bili_') ? 'bili' : undefined
  return platform ? { platform } : {}
}

const parallelMapLimit = async <T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = []
  let idx = 0
  const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
    while (idx < items.length) {
      const cur = idx++
      out[cur] = await mapper(items[cur])
    }
  })
  await Promise.all(workers)
  return out
}

export const createResultsManager = (opts: Options) => {
  const resultsRoot = opts.overrideResultsRoot?.trim()
    ? path.resolve(opts.overrideResultsRoot.trim())
    : path.join(opts.homeDir, 'OmniScraperExports')

  const runsRoot = path.join(resultsRoot, 'runs')
  const exportsRoot = path.join(resultsRoot, 'exports')

  const ensureDirs = async () => {
    await fs.mkdir(runsRoot, { recursive: true })
    await fs.mkdir(exportsRoot, { recursive: true })
  }

  const getResultsRoot = async (): Promise<ResultsRootResult> => {
    try {
      await ensureDirs()
      return { ok: true, path: resultsRoot }
    } catch (e) {
      return { ok: false, error: `cannot_create_results_root:${String(e)}` }
    }
  }

  const listRuns = async (): Promise<ListRunsResult> => {
    try {
      await ensureDirs()
      const entries = await fs.readdir(runsRoot, { withFileTypes: true })
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)

      const metas = await parallelMapLimit(dirs, 10, async (dirName) => {
        const dirPath = path.join(runsRoot, dirName)
        const metaPath = path.join(dirPath, 'meta.json')
        try {
          const raw = await fs.readFile(metaPath, 'utf-8')
          const parsed = JSON.parse(raw) as unknown
          if (isRunMeta(parsed)) return parsed
          return {
            run_id: dirName,
            created_at_ms: (await fs.stat(dirPath)).birthtimeMs || Date.now(),
            status: 'unknown',
            warning: 'invalid_meta_json',
            ...runDirNameFallback(dirName),
          } satisfies RunMeta
        } catch {
          const st = await fs.stat(dirPath)
          return {
            run_id: dirName,
            created_at_ms: st.birthtimeMs || st.mtimeMs || Date.now(),
            status: 'unknown',
            warning: 'missing_meta_json',
            ...runDirNameFallback(dirName),
          } satisfies RunMeta
        }
      })

      metas.sort((a, b) => b.created_at_ms - a.created_at_ms)
      return { ok: true, items: metas }
    } catch (e) {
      return { ok: false, error: `list_runs_failed:${String(e)}` }
    }
  }

  const readRunReport = async (runId: string): Promise<ReadRunReportResult> => {
    if (!isSafeRunId(runId)) return { ok: false, error: 'bad_run_id' }
    try {
      await ensureDirs()
      const reportPath = path.join(runsRoot, runId, 'mvp_report.md')
      const md = await fs.readFile(reportPath, 'utf-8')
      return { ok: true, markdown: md }
    } catch (e) {
      return { ok: false, error: `read_report_failed:${String(e)}` }
    }
  }

  return { getResultsRoot, listRuns, readRunReport, _internal: { resultsRoot, runsRoot, exportsRoot } }
}
