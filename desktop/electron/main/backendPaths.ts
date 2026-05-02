import * as path from 'node:path'

export type ResolvedBackend =
  | { mode: 'python'; pythonExecPath: string; entryPath: string }
  | { mode: 'exe'; execPath: string }

export const resolveBackend = (input: { isPackaged: boolean; resourcesPath: string; appRoot: string; env: Record<string, string | undefined> }): ResolvedBackend => {
  if (input.isPackaged) {
    const execPath = path.join(
      input.resourcesPath,
      'python',
      process.platform === 'win32' ? 'omni-backend.exe' : 'omni-backend',
    )
    return { mode: 'exe', execPath }
  }

  const pythonExecPath = input.env.MEDIA_CRAWLER_PYTHON || 'python3'
  const entryPath =
    input.env.MEDIA_CRAWLER_ENTRY ||
    path.join(input.env.MEDIA_CRAWLER_SRC || path.join(input.appRoot, 'vendor', 'MediaCrawler'), 'main.py')
  return { mode: 'python', pythonExecPath, entryPath }
}

