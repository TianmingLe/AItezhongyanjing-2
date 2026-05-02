import * as fs from 'node:fs/promises'
import * as path from 'node:path'

type Input = {
  runDir: string
  startedAtMs: number
  finishedAtMs: number
  defaultRunsRoot: string
}

type Result = { ok: true; sourceDir: string } | { ok: false; error: string }

const GRACE_MS = 2 * 60_000

const exists = async (p: string) => {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

export const maybeCopyArtifacts = async (input: Input): Promise<Result> => {
  const wantReport = path.join(input.runDir, 'mvp_report.md')
  if (await exists(wantReport)) return { ok: true, sourceDir: input.runDir }

  const lo = input.startedAtMs - GRACE_MS
  const hi = input.finishedAtMs + GRACE_MS

  let entries: string[] = []
  try {
    const dirents = await fs.readdir(input.defaultRunsRoot, { withFileTypes: true })
    entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name)
  } catch (e) {
    return { ok: false, error: `cannot_read_default_runs_root:${String(e)}` }
  }

  let best: { dir: string; mtimeMs: number } | null = null

  for (const name of entries) {
    const dir = path.join(input.defaultRunsRoot, name)
    const report = path.join(dir, 'mvp_report.md')
    if (!(await exists(report))) continue
    let st: any = null
    try {
      st = await fs.stat(report)
    } catch {
      continue
    }
    const t = st.mtimeMs ?? 0
    if (t < lo || t > hi) continue
    if (!best || t > best.mtimeMs) best = { dir, mtimeMs: t }
  }

  if (!best) return { ok: false, error: 'no_candidate_run_found' }

  try {
    await fs.mkdir(input.runDir, { recursive: true })
    await fs.cp(best.dir, input.runDir, { recursive: true })
    return { ok: true, sourceDir: best.dir }
  } catch (e) {
    return { ok: false, error: `copy_failed:${String(e)}` }
  }
}

