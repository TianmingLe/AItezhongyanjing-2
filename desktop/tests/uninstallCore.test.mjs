import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = path.resolve(process.cwd())
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-uninstall-core-test-'))

execFileSync(
  process.execPath,
  [
    path.join(repoRoot, 'node_modules/typescript/bin/tsc'),
    '--outDir',
    outDir,
    '--target',
    'ES2022',
    '--module',
    'commonjs',
    path.join(repoRoot, 'electron/main/uninstallCore.ts'),
  ],
  { stdio: 'inherit' },
)

const require = createRequire(import.meta.url)
const { performUninstall } = require(path.join(outDir, 'uninstallCore.js'))

test('performUninstall deletes resultsRoot and userDataDir under home', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'))
  const resultsRoot = path.join(home, 'OmniScraperExports')
  const userDataDir = path.join(home, '.config', 'omniscraper')
  fs.mkdirSync(path.join(resultsRoot, 'runs'), { recursive: true })
  fs.writeFileSync(path.join(resultsRoot, 'runs', 'x.txt'), '1', 'utf-8')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), '{}', 'utf-8')

  const actions = await performUninstall({
    homeDir: home,
    resultsRoot,
    userDataDir,
    platform: 'linux',
    exePath: '/tmp/omni',
    openPath: async () => undefined,
    showItemInFolder: async () => undefined,
    openExternal: async () => undefined,
  })

  assert.equal(fs.existsSync(resultsRoot), false)
  assert.equal(fs.existsSync(userDataDir), false)
  assert.equal(Array.isArray(actions), true)
})

test('performUninstall rejects unsafe delete targets', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'))
  await assert.rejects(() =>
    performUninstall({
      homeDir: home,
      resultsRoot: '/tmp',
      userDataDir: path.join(home, 'x'),
      platform: 'linux',
      exePath: '/tmp/omni',
      openPath: async () => undefined,
      showItemInFolder: async () => undefined,
      openExternal: async () => undefined,
    }),
  )
})

