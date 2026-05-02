import { execFile } from 'node:child_process'

export const supportsOutputDirArgFromHelp = (text: string) => /(^|\s)--output-dir(\s|$)/m.test(text)

let cached: boolean | null = null

export const detectSupportsOutputDirArg = async (pythonExecPath: string, entryPath: string): Promise<boolean> => {
  if (cached !== null) return cached
  if (!entryPath) {
    cached = true
    return cached
  }
  const help = await new Promise<string>((resolve) => {
    execFile(pythonExecPath, ['-u', entryPath, '--help'], { timeout: 5000 }, (_err, stdout, stderr) => {
      resolve(`${stdout ?? ''}\n${stderr ?? ''}`)
    })
  })
  cached = supportsOutputDirArgFromHelp(help)
  return cached
}

export const resetOutputDirSupportCacheForTests = () => {
  cached = null
}
