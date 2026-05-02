import * as fs from 'node:fs'
import * as path from 'node:path'

type Platform = 'win' | 'darwin' | 'linux'
type Arch = 'x64' | 'arm64'

export const resolveManifestPath = (input: {
  appRoot: string
  platform: Platform
  arch: Arch
  env: Record<string, string | undefined>
}) => {
  const override = input.env.OMNI_MANIFEST_PATH
  if (override) return override

  const candidate = path.join(input.appRoot, `resources-manifest.${input.platform}.${input.arch}.json`)
  if (fs.existsSync(candidate)) return candidate

  return path.join(input.appRoot, 'resources-manifest.json')
}

