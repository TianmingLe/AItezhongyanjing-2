import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const acquireResourceLock = async (lockPath: string, opts: { staleMs: number }) => {
  const now = Date.now()
  let existing: any = null
  try {
    existing = JSON.parse(await fs.readFile(lockPath, 'utf-8'))
  } catch {
    existing = null
  }
  if (existing && isRecord(existing) && typeof existing.timestamp === 'number') {
    const age = now - existing.timestamp
    if (age <= opts.staleMs) {
      throw new Error('Resource download in progress by another instance')
    }
  }

  await fs.mkdir(path.dirname(lockPath), { recursive: true })
  await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid, timestamp: now }, null, 2), 'utf-8')

  let released = false
  return async () => {
    if (released) return
    released = true
    try {
      await fs.unlink(lockPath)
    } catch {
      // ignore
    }
  }
}

