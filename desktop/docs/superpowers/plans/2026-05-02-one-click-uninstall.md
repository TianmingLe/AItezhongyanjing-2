# One-Click Uninstall（数据清理 + 引导系统卸载）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置页提供“一键卸载”按钮，二次确认后由 Main 进程清理 `~/OmniScraperExports` 与 Electron `userData`，并对不同平台给出安全的卸载引导（不做高风险强删），最终退出应用。

**Architecture:** Renderer 负责二次确认与触发 IPC；Main 实现 `app:uninstall` handler，执行：停止任务（若需要）→ 路径校验 → 删除 resultsRoot/userData → 平台引导（openPath/revealItemInFolder/启动卸载器）→ app.quit。

**Tech Stack:** Electron IPC, Node fs/promises, platform-specific shell open, existing ResultsManager paths.

---

## File map

**Create**
- `desktop/electron/main/ipc/uninstallIpc.ts`
- `desktop/src/pages/SettingsPage.tsx`
- `desktop/tests/uninstallIpc.test.mjs`

**Modify**
- `desktop/electron/main/index.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/preload/validators.ts`
- `desktop/electron/shared/protocol.ts` (or create `shared/uninstall.ts` if preferred)
- `desktop/src/App.tsx` (route)
- `desktop/src/components/Sidebar.tsx` (entry link)

---

### Task 1: Shared types + preload validator（RED→GREEN）

**Files:**
- Modify: `desktop/electron/shared/protocol.ts`
- Modify: `desktop/electron/preload/validators.ts`
- Modify: `desktop/electron/preload/index.ts`
- Test: `desktop/tests/preloadValidators.test.mjs`

- [ ] **Step 1: Add uninstall request/response types**

Add types:

```ts
export type UninstallRequest = Record<string, never>
export type UninstallResult =
  | { ok: true; actions: Array<{ type: string; message: string }> }
  | { ok: false; error: string }
```

- [ ] **Step 2: Write failing validator test**

Extend preload validator tests to include `parseUninstallRequest` and `parseUninstallResult`.

- [ ] **Step 3: Implement validators**

Implement strict shape validation and reject unknown fields.

- [ ] **Step 4: Expose preload API**

Add:

```ts
uninstallApp: async (): Promise<UninstallResult> => ipcRenderer.invoke('app:uninstall', {})
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd /workspace/desktop
node --test tests/preloadValidators.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add desktop/electron/shared/protocol.ts desktop/electron/preload/validators.ts desktop/electron/preload/index.ts desktop/tests/preloadValidators.test.mjs
git commit -m "feat: add uninstall ipc types and preload api"
```

---

### Task 2: Main uninstall IPC（RED→GREEN）

**Files:**
- Create: `desktop/electron/main/ipc/uninstallIpc.ts`
- Modify: `desktop/electron/main/index.ts`
- Test: `desktop/tests/uninstallIpc.test.mjs`

- [ ] **Step 1: Write failing test**

Test behavior:
- given a temp HOME and OVERRIDE_RESULTS_ROOT pointing into it, uninstall deletes resultsRoot
- does not delete outside-of-root paths

- [ ] **Step 2: Implement uninstallIpc**

Key behavior:
- compute `resultsRoot` (respect `OVERRIDE_RESULTS_ROOT`), `userData` from `app.getPath('userData')`
- verify deletion targets are within expected roots (no traversal)
- `fs.rm(target, { recursive: true, force: true })`
- best-effort platform guidance:
  - win32: try to locate `Uninstall.exe` under install dir; else open settings page
  - darwin: reveal app location (shell.showItemInFolder)
  - linux: reveal executable folder + instructions
- return `{ ok: true, actions }` for UI display
- call `app.quit()` after scheduling actions

- [ ] **Step 3: Register IPC in main**

Wire in `electron/main/index.ts` during startup:

```ts
registerUninstallIpc({ rm, pm, getMainWindow: () => mainWindow })
```

- [ ] **Step 4: Run test**

Run:

```bash
cd /workspace/desktop
node --test tests/uninstallIpc.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add desktop/electron/main/ipc/uninstallIpc.ts desktop/electron/main/index.ts desktop/tests/uninstallIpc.test.mjs
git commit -m "feat: add one-click uninstall ipc"
```

---

### Task 3: Renderer 设置页 UI（二次确认）（RED→GREEN）

**Files:**
- Create: `desktop/src/pages/SettingsPage.tsx`
- Modify: `desktop/src/App.tsx`
- Modify: `desktop/src/components/Sidebar.tsx`
- Test: `desktop/tests/settingsPage.test.mjs` (optional; if test infra exists)

- [ ] **Step 1: Implement Settings page**

UI flow:
- Button: “一键卸载”
- Confirm #1: modal confirm
- Confirm #2: input must equal `UNINSTALL`
- Call `window.electronAPI.uninstallApp()` and show returned `actions` or error

- [ ] **Step 2: Add route + sidebar entry**

Add a Settings route and link in sidebar.

- [ ] **Step 3: Manual smoke**

Run dev app and verify button flow.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/pages/SettingsPage.tsx desktop/src/App.tsx desktop/src/components/Sidebar.tsx
git commit -m "feat: add settings page uninstall flow"
```

---

### Task 4: Full regression

- [ ] **Step 1: Typecheck**

```bash
cd /workspace/desktop
npx tsc -p tsconfig.json --noEmit
```

- [ ] **Step 2: Unit tests**

```bash
cd /workspace/desktop
node --test
```

- [ ] **Step 3: Package smoke (Linux)**

```bash
cd /workspace/desktop
npm run package
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: one-click uninstall"
```

