# Phase 5 Task 4（打包分发配置）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 产出跨平台安装包（Windows/macOS/Linux），内置可执行 Python 后端；首次启动按需下载 Playwright 浏览器与 OCR/ASR 模型，并展示进度。

**Architecture:** Python 侧使用 PyInstaller onefile 生成 `omni-backend(.exe)`；Electron 侧通过 preload 白名单触发 `resources.ensure()`，Main spawn 后端子命令 `--setup-resources` 并将进度事件推给 Renderer；ProcessManager 在 dev/prod 选择不同启动方式（python3+源码 vs resourcesPath+bundle exe）。

**Tech Stack:** Electron 33, electron-vite, electron-builder, PyInstaller, TypeScript, Node.js.

---

## File map（本任务会动的文件）

**Create**
- `desktop/scripts/build_python_bundle.py`
- `desktop/electron/shared/resources.ts`
- `desktop/electron/main/ipc/resourcesIpc.ts`
- `desktop/src/services/resourceManager.ts`
- `desktop/src/components/ResourceGate.tsx`
- `desktop/tests/resourcesValidators.test.mjs`

**Modify**
- `desktop/package.json`
- `desktop/electron/preload/validators.ts`
- `desktop/electron/preload/index.ts`
- `desktop/src/types/electron.d.ts`
- `desktop/src/App.tsx`
- `desktop/electron/main/processManager.ts`
- `desktop/electron/main/index.ts`（注册 resources IPC）

---

### Task 1: 引入 electron-builder 并新增 npm run package

**Files:**
- Modify: `desktop/package.json`

- [ ] **Step 1: Add devDependency electron-builder**

Update `devDependencies`:

```json
{
  "devDependencies": {
    "electron-builder": "^25.1.8"
  }
}
```

- [ ] **Step 2: Add scripts**

Add:

```json
{
  "scripts": {
    "package": "npm run build && node scripts/build_python_bundle.py && electron-builder --config"
  }
}
```

Notes:
- 这里先用 `--config` 走 package.json 的 `build` 字段；后续 Task 2 填充 build 配置。

- [ ] **Step 3: Add build config skeleton**

Add minimal:

```json
{
  "build": {
    "appId": "com.omni.scraper",
    "productName": "OmniScraper",
    "files": [
      "out/**"
    ],
    "extraResources": [
      {
        "from": "python_dist",
        "to": "python"
      }
    ]
  }
}
```

- [ ] **Step 4: Install deps**

Run:

```bash
cd /workspace/desktop
npm install
```

Expected: `electron-builder` installed.

---

### Task 2: build_python_bundle.py（PyInstaller onefile）

**Files:**
- Create: `desktop/scripts/build_python_bundle.py`

- [ ] **Step 1: Write a failing smoke test (script invocation)**

Create `desktop/tests/pythonBundleScript.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('python bundle script exists', () => {
  assert.equal(fs.existsSync(new URL('../scripts/build_python_bundle.py', import.meta.url)), true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /workspace/desktop
node --test tests/pythonBundleScript.test.mjs
```

Expected: FAIL (file not found).

- [ ] **Step 3: Implement build_python_bundle.py**

Implement with behavior:
- read `MEDIA_CRAWLER_SRC` else fallback `vendor/MediaCrawler`
- if `MEDIA_CRAWLER_SRC` provided and vendor missing/outdated: copytree into vendor
- detect deps:
  - if `requirements.txt` exists, install it
  - else if `pyproject.toml` exists, `pip install .`
- create venv under `desktop/.python_build/venv`
- install `pyinstaller`
- run PyInstaller:
  - `pyinstaller --onefile --name omni-backend <entry>`
- output to `desktop/python_dist/<platform>/`

The script must:
- exit non-zero on failure
- print clear stage logs (not secrets)

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /workspace/desktop
node --test tests/pythonBundleScript.test.mjs
```

Expected: PASS.

---

### Task 3: Resources IPC & validators（preload 白名单）

**Files:**
- Create: `desktop/electron/shared/resources.ts`
- Create: `desktop/electron/main/ipc/resourcesIpc.ts`
- Modify: `desktop/electron/preload/validators.ts`
- Modify: `desktop/electron/preload/index.ts`
- Modify: `desktop/src/types/electron.d.ts`
- Test: `desktop/tests/resourcesValidators.test.mjs`

- [ ] **Step 1: Write failing validator tests**

Create `desktop/tests/resourcesValidators.test.mjs` compiling:
- `electron/shared/resources.ts`
- `electron/preload/validators.ts`

Assertions:
- `parseEnsureResourcesResult` accepts `{ ok:true }` and rejects unknown fields
- `parseResourceProgressEvent` accepts `{ type:'resources', phase:'downloading', percent:10, message:'x' }`

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cd /workspace/desktop
node --test tests/resourcesValidators.test.mjs
```

Expected: FAIL (missing files/exports).

- [ ] **Step 3: Implement shared/resources.ts**

Define:
- `EnsureResourcesRequest` (empty object)
- `EnsureResourcesResult` union `{ok:true}|{ok:false,error:string}`
- `ResourcePhase` = `checking|downloading|ready|error`
- `ResourceProgressEvent` = `{type:'resources', phase, percent?:number, message?:string}`
- strict type guards like existing `runs.ts/export.ts`

- [ ] **Step 4: Implement preload validators + API**

Add:
- `window.electronAPI.ensureResources(): Promise<EnsureResourcesResult>`
- `window.electronAPI.onResourcesProgress(cb): () => void`

IPC channels:
- `resources:ensure`
- `resources:progress` (event)

- [ ] **Step 5: Implement main IPC stub**

`resourcesIpc.ts`:
- `ipcMain.handle('resources:ensure', ...)` returns `{ok:true}` for now
- `webContents.send('resources:progress', ...)` helper (later Task 4 用)

- [ ] **Step 6: Verify tests GREEN**

Run:

```bash
cd /workspace/desktop
node --test tests/resourcesValidators.test.mjs
```

Expected: PASS.

---

### Task 4: Renderer ResourceGate + resourceManager（进度条与 gating）

**Files:**
- Create: `desktop/src/services/resourceManager.ts`
- Create: `desktop/src/components/ResourceGate.tsx`
- Modify: `desktop/src/App.tsx`

- [ ] **Step 1: Add ResourceGate UI**

`ResourceGate` props:
- `phase`
- `percent`
- `message`

Render:
- title “环境初始化”
- progress bar（div 宽度百分比即可）
- 状态文案

- [ ] **Step 2: Implement resourceManager**

API:
- `startResourceEnsure({ onProgress })`:
  - call `electronAPI.ensureResources()`
  - subscribe `onResourcesProgress`
  - resolve when ok/ready

- [ ] **Step 3: Integrate into App**

On boot:
- enter `checking/downloading`
- until ready:
  - render `<ResourceGate />`
  - disable navigation into RunPage start (or disable TaskConfig start button via prop)

---

### Task 5: Main resources ensure 实现（调用后端 --setup-resources 并推送进度）

**Files:**
- Modify: `desktop/electron/main/processManager.ts` (or new helper)
- Modify: `desktop/electron/main/index.ts`
- Modify: `desktop/electron/main/ipc/resourcesIpc.ts`

- [ ] **Step 1: Decide backend path resolver**

Add helper in main:
- `resolveBackendExecutable({ isPackaged, resourcesPath, envOverrides })`

Rules:
- dev: `python3` + `<MEDIA_CRAWLER_SRC>/main.py`
- prod: `<process.resourcesPath>/python/omni-backend(.exe)`

- [ ] **Step 2: Implement ensure handler**

When `resources:ensure`:
- compute `resourcesRoot = <home>/OmniScraperExports/resources`
- env:
  - `PLAYWRIGHT_BROWSERS_PATH=<resourcesRoot>/playwright-browsers`
  - `OMNI_MODELS_DIR=<resourcesRoot>/models`
- spawn backend with args `--setup-resources`
- parse stdout lines with existing `parseLine` rules:
  - `[PROGRESS] xx% message` → `resources:progress` event
  - `[INFO]/[WARN]/[ERROR]` → map to progress message
- return `{ok:true}` when exit code 0 else `{ok:false,error:...}`

- [ ] **Step 3: Add minimal existence checks**

Before spawning:
- if key directories already exist, emit `phase=ready` quickly and return ok.

---

### Task 6: ProcessManager dev/prod switch（任务执行也走 backend exe）

**Files:**
- Modify: `desktop/electron/main/processManager.ts`

- [ ] **Step 1: Write failing unit test**

Create `desktop/tests/backendPathResolve.test.mjs` (compile a new helper module):
- dev mode returns python3+entry
- prod mode returns bundled exe path

- [ ] **Step 2: Implement helper module**

Create `desktop/electron/main/backendPaths.ts`:
- `resolveBackendExec({ isPackaged, resourcesPath, env })`

- [ ] **Step 3: Update ProcessManager**

Change spawn:
- if resolved `mode==='exe'`: spawn exe with `config.args`
- else: spawn python with `-u entryPath ...config.args`

Keep existing env safety filter.

---

### Task 7: Packaging verification

- [ ] **Step 1: Typecheck**

Run:

```bash
cd /workspace/desktop
npx tsc -p tsconfig.json --noEmit
```

- [ ] **Step 2: Run tests**

Run:

```bash
cd /workspace/desktop
node --test
```

- [ ] **Step 3: Build bundle + package**

Run:

```bash
cd /workspace/desktop
npm run package
```

Expected:
- electron-builder outputs artifacts directory with installers
- `python_dist/**` included in packaged app (via extraResources)

---

## Self-review checklist

- Spec coverage: PyInstaller 脚本、资源下载管理器、electron-builder 配置、dev/prod 启动适配、userData/resource 路径注入均有对应 task
- Placeholder scan: 无 “TODO/TBD”，每个 task 有明确文件路径与命令
- Type consistency: resources 协议与 preload validators 命名一致；backendPaths 被 processManager/main IPC 共用

