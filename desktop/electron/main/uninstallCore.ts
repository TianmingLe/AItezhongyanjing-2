import * as fs from 'node:fs/promises'
import * as path from 'node:path'

type UninstallAction = { type: string; message: string }

type Input = {
  homeDir: string
  resultsRoot: string
  userDataDir: string
  platform: NodeJS.Platform
  exePath: string
  openPath: (p: string) => Promise<void>
  showItemInFolder: (p: string) => Promise<void>
  openExternal: (u: string) => Promise<void>
}

const safeWithinHome = (homeDir: string, target: string) => {
  const homeAbs = path.resolve(homeDir)
  const tAbs = path.resolve(target)
  const root = path.parse(tAbs).root
  if (tAbs === root) return false
  return tAbs === homeAbs || tAbs.startsWith(homeAbs + path.sep)
}

const safeDelete = async (p: string) => {
  await fs.rm(p, { recursive: true, force: true })
}

export const performUninstall = async (input: Input): Promise<UninstallAction[]> => {
  if (!path.isAbsolute(input.homeDir)) throw new Error('bad_home_dir')
  if (!path.isAbsolute(input.resultsRoot)) throw new Error('bad_results_root')
  if (!path.isAbsolute(input.userDataDir)) throw new Error('bad_user_data')
  if (!safeWithinHome(input.homeDir, input.resultsRoot)) throw new Error('unsafe_delete_target')
  if (!safeWithinHome(input.homeDir, input.userDataDir)) throw new Error('unsafe_delete_target')

  const actions: UninstallAction[] = []

  await safeDelete(input.resultsRoot)
  actions.push({ type: 'delete', message: `已清理 ${input.resultsRoot}` })

  await safeDelete(input.userDataDir)
  actions.push({ type: 'delete', message: `已清理 ${input.userDataDir}` })

  const exeDir = path.dirname(input.exePath)

  if (input.platform === 'win32') {
    const candidates = [
      path.join(exeDir, 'Uninstall.exe'),
      path.join(exeDir, 'uninstall.exe'),
      path.join(exeDir, 'Uninstall OmniScraper.exe'),
      path.join(exeDir, 'Uninstall OmniScraper-Desktop.exe'),
      path.join(exeDir, 'unins000.exe'),
    ]
    for (const c of candidates) {
      try {
        await fs.stat(c)
        await input.openPath(c)
        actions.push({ type: 'open', message: '已打开卸载程序，请按系统引导完成卸载' })
        return actions
      } catch {
        // ignore
      }
    }
    try {
      await input.openExternal('ms-settings:appsfeatures')
      actions.push({ type: 'open', message: '请在系统“应用和功能”中卸载 OmniScraper' })
    } catch {
      actions.push({ type: 'open', message: '请在系统设置中卸载 OmniScraper' })
    }
    return actions
  }

  if (input.platform === 'darwin') {
    try {
      await input.showItemInFolder(input.exePath)
      actions.push({ type: 'open', message: '请将 OmniScraper.app 拖到废纸篓完成卸载' })
    } catch {
      actions.push({ type: 'open', message: '请将 OmniScraper.app 拖到废纸篓完成卸载' })
    }
    return actions
  }

  try {
    await input.showItemInFolder(input.exePath)
    actions.push({ type: 'open', message: '请删除 AppImage 文件完成卸载' })
  } catch {
    actions.push({ type: 'open', message: '请删除 AppImage 文件完成卸载' })
  }
  return actions
}
