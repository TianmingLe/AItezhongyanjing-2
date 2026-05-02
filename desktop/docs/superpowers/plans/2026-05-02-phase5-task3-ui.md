# Phase 5 Task 3（UI 完善）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成桌面端专业 UI：任务配置、历史任务、报告预览与导出、系统托盘与通知；所有文件/导出操作通过 preload 白名单，保持 Task 2 接口兼容。

**Architecture:** Main 增加 results/export/tray 管理模块与 TaskRegistry；Preload 扩展白名单 API；Renderer 实现 Sidebar/TaskConfig/HistoryList/ReportPreview/Terminal 页面与数据流。

**Tech Stack:** Electron, electron-vite, React, TypeScript, `react-markdown`, `remark-gfm`, `rehype-highlight`, `highlight.js`.

---

## Task 3.1：依赖与 UI 基础骨架（Sidebar + 页面切换）

**Files**
- Modify: `/workspace/desktop/package.json`
- Create: `/workspace/desktop/src/components/Sidebar.tsx`
- Create: `/workspace/desktop/src/pages/RunPage.tsx`
- Create: `/workspace/desktop/src/pages/HistoryPage.tsx`
- Modify: `/workspace/desktop/src/App.tsx`

- [ ] **Step 1: 安装 Markdown 渲染依赖**

Run:

```bash
cd /workspace/desktop
npm install react-markdown remark-gfm rehype-highlight highlight.js
```

- [ ] **Step 2: 新建 Sidebar（无路由库，使用 state 切换）**

Create `src/components/Sidebar.tsx`（包含 `任务/历史` 两个入口）。

- [ ] **Step 3: 拆分页面组件**

Create:
- `src/pages/RunPage.tsx`：包含 TaskConfig + Terminal + ReportPreview（当前 run）
- `src/pages/HistoryPage.tsx`：包含 HistoryList + ReportPreview

- [ ] **Step 4: App.tsx 改为 Sidebar + page**

Modify `src/App.tsx`：
- 保留已有 WS+IPC 日志接入逻辑（可下沉到 RunPage）
- 将 “Start/Stop/WS断线/Crash” 这些调试按钮移到 dev-only 或替换为 TaskConfig

- [ ] **Step 5: 验证编译**

Run:

```bash
cd /workspace/desktop
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS

- [ ] **Step 6: 全局 focus-visible（深色主题）**

在 `electron/renderer/index.html` 或新增全局 CSS 中加入 `:focus-visible` 样式（不得 `outline: none`），确保键盘导航可见。

---

## Task 3.2：Main 侧 results root + run 扫描/读取（IPC）

**Files**
- Create: `/workspace/desktop/electron/main/resultsManager.ts`
- Modify: `/workspace/desktop/electron/main/index.ts`
- Create: `/workspace/desktop/electron/main/ipc/resultsIpc.ts`
- Create: `/workspace/desktop/electron/shared/runs.ts`

- [ ] **Step 1: 定义 RunMeta 类型（shared）**

Create `electron/shared/runs.ts`：
- `RunMeta` 类型（与 spec 一致）
- `isRunMeta` / `isListRunsResult` 等 guards（供 preload 与 main 共用）

- [ ] **Step 2: 实现 resultsManager**

Create `electron/main/resultsManager.ts`：
- `getResultsRoot()`：`OVERRIDE_RESULTS_ROOT` 优先，否则 `app.getPath('home')/OmniScraperExports`，并确保创建 `runs/` 与 `exports/`
- `listRuns()`：扫描 `runs/*/meta.json`，按 `created_at_ms` 倒序，缺失 meta.json 则返回 `status:'unknown'` 并附 warning 字段
- `readRunReport(runId)`：只允许读取 `<runId>/mvp_report.md`，并禁止路径穿越

- [ ] **Step 3: IPC handlers**

Create `electron/main/ipc/resultsIpc.ts`，注册：
- `results:getRoot`
- `results:listRuns`
- `results:readRunReport`

Modify `electron/main/index.ts`：在 `createWindow()` 时调用注册函数。

- [ ] **Step 4: 单元验证（node:test）**

Create `tests/resultsManager.test.mjs`：
- 目录不存在自动创建
- runId 路径穿越拒绝（例如 `../../etc/passwd`）

---

## Task 3.3：Preload 扩展 results API（白名单 + type guard）

**Files**
- Modify: `/workspace/desktop/electron/preload/index.ts`
- Modify: `/workspace/desktop/electron/preload/validators.ts`
- Modify: `/workspace/desktop/src/types/electron.d.ts`
- Modify: `/workspace/desktop/tests/preloadValidators.test.mjs`

- [ ] **Step 1: 增加 preload validators**

在 `electron/preload/validators.ts` 增加：
- `parseResultsRootResult`
- `parseListRunsResult`
- `parseReadRunReportResult`

- [ ] **Step 2: 扩展 preload index.ts**

在 `electron/preload/index.ts` 增加暴露：
- `getResultsRoot()`
- `listRuns()`
- `readRunReport(runId)`

- [ ] **Step 3: 更新 Renderer window 类型**

Update `src/types/electron.d.ts` 对应方法签名。

- [ ] **Step 4: 更新 validators 单测**

Update `tests/preloadValidators.test.mjs` 覆盖新增 API 的参数/返回校验（拒绝未知字段）。

---

## Task 3.4：TaskConfig 表单（生成 CLI args + env + 启动）

**Files**
- Create: `/workspace/desktop/src/components/TaskConfig.tsx`
- Create: `/workspace/desktop/src/utils/argsBuilder.ts`
- Modify: `/workspace/desktop/src/pages/RunPage.tsx`

- [ ] **Step 1: argsBuilder**

Create `src/utils/argsBuilder.ts`：
- 输入：`TaskFormState`
- 输出：`{ args: string[]; env?: Record<string,string> }`
- 不把 `llm_api_key` 写入 args；改为 `env` 注入（例如 `LLM_API_KEY`），并在 UI 文案提示可用环境变量

- [ ] **Step 2: TaskConfig**

Create `src/components/TaskConfig.tsx`：
- 平台选择（dy/xhs/bili + 图标）
- 模式切换（detail/search）
- 高级参数折叠（ocr/comment_depth/enable_llm + LLM 配置）
- 校验失败展示 inline error
- “开始任务/停止任务” 调用 `window.electronAPI.startTask({ args, env })` / `stopTask()`

可访问性要求（本 Step 一并完成）：
- 所有表单控件必须有 `<label>` 或 `aria-label`
- 输入框必须有 `name` 与合适的 `autoComplete`
- placeholder 使用 `…`
- 按钮提供 `:focus-visible`（若全局样式不足，组件内补）

- [ ] **Step 3: 接入 RunPage**

Modify `RunPage.tsx`：
- 维护 `busy`（从 status events 推导）
- 维持 Terminal 滑窗 2000 条策略

---

## Task 3.5：历史任务列表（HistoryList + 预览 + 重新运行）

**Files**
- Create: `/workspace/desktop/src/components/HistoryList.tsx`
- Modify: `/workspace/desktop/src/pages/HistoryPage.tsx`

- [ ] **Step 1: HistoryList 组件**

Create `HistoryList.tsx`：
- 调用 `listRuns()` 获取 items
- 按时间倒序渲染（Main 已排序，UI 仍可二次防御）
- 缺 meta.json：显示 warning 文案 “该任务缺少元数据，建议重新运行”
降级策略：
- 优先从目录名推断平台/时间
- 如需读取报告推断，只读取前 50 行（避免大文件阻塞）

- [ ] **Step 2: HistoryPage 组合**

Modify `HistoryPage.tsx`：
- 选中 run → 调用 `readRunReport(runId)` → 交给 ReportPreview 渲染
- 重新运行：复用 meta 的 `cli_args`（若存在）→ 调用 startTask

---

## Task 3.6：ReportPreview（Markdown 渲染 + 导出按钮）

**Files**
- Create: `/workspace/desktop/src/components/ReportPreview.tsx`
- Create: `/workspace/desktop/src/services/exportService.ts`
- Modify: `/workspace/desktop/src/pages/RunPage.tsx`
- Modify: `/workspace/desktop/src/pages/HistoryPage.tsx`

- [ ] **Step 1: ReportPreview**

Create `ReportPreview.tsx`：
- 顶部固定提示（必须显式显示：PDF 中文依赖系统字体，缺字建议用 Markdown 导出）
- 渲染：`react-markdown` + `remark-gfm` + `rehype-highlight`
- 导出按钮：Markdown / PDF / JSON（调用 `exportService`）

- [ ] **Step 2: exportService**

Create `src/services/exportService.ts`：
- 仅调用 `window.electronAPI.exportFile({ runId, format })`

---

## Task 3.7：Main 侧导出（dialog + printToPDF）

**Files**
- Create: `/workspace/desktop/electron/main/exportManager.ts`
- Create: `/workspace/desktop/electron/main/ipc/exportIpc.ts`
- Modify: `/workspace/desktop/electron/main/index.ts`
- Modify: `/workspace/desktop/electron/preload/index.ts`
- Modify: `/workspace/desktop/electron/preload/validators.ts`
- Modify: `/workspace/desktop/src/types/electron.d.ts`

- [ ] **Step 1: exportManager**

Create `exportManager.ts`：
- `exportMarkdown(runId)`：读取 mvp_report.md → dialog 选路径 → 写入
- `exportJson(runId)`：读取 meta.json → dialog → 写入
- `exportPdf(runId)`：
  - 隐藏 BrowserWindow
  - load HTML（最简模板 + highlight.js CSS 可选）
  - `printToPDF({ pageSize:'A4', printBackground:true, marginsType:1 })`
  - dialog 选路径 → 写入
  - destroy window

- [ ] **Step 2: IPC**

Create `exportIpc.ts` 注册 `export:save`：
- 入参：`{ runId, format }`
- 出参：`{ ok, path? , error? }`

- [ ] **Step 3: Preload 白名单**

增加 `electronAPI.exportFile()`，并补齐 validators + 类型定义。

---

## Task 3.8：托盘 + 通知（最小化/关闭拦截）

**Files**
- Create: `/workspace/desktop/electron/main/tray.ts`
- Modify: `/workspace/desktop/electron/main/index.ts`

- [ ] **Step 1: tray.ts**

Create `tray.ts`：
- `initTray({ getWindow, onQuit })`
- 菜单：显示/隐藏、退出

- [ ] **Step 2: 拦截关闭/最小化**

Modify `main/index.ts`：
- `win.on('minimize', e => { e.preventDefault(); win.hide() })`
- `win.on('close', e => { if (!app.isQuiting) { e.preventDefault(); win.hide() } })`
- 托盘“退出应用”时设置 `app.isQuiting=true` 再 `app.quit()`
 - 首次关闭/最小化弹出一次提示（toast 或 Notification）：`已最小化到托盘`

- [ ] **Step 3: 任务完成通知**

在 `pm.onEvent` 里监听 `StatusEvent`：
- `stopped` → Notification(任务完成)
- `error` → Notification(任务失败)

---

## Task 3.9：端到端验收

**Files**
- (no new files required)

- [ ] **Step 1: TypeScript**

```bash
cd /workspace/desktop
npx tsc -p tsconfig.json --noEmit
```

- [ ] **Step 2: 单测**

```bash
cd /workspace/desktop
node --test
```

- [ ] **Step 3: dev 验收**

```bash
cd /workspace/desktop
npm run dev
```

验收点：
- TaskConfig 正确生成 args，能够启动任务
- Terminal 实时滚动（2000 条上限）
- 历史列表从 `~/OmniScraperExports/runs/` 读取 meta.json 并展示
- ReportPreview 正确渲染 mvp_report.md
- 导出 Markdown/PDF/JSON 可落盘
- 关闭/最小化进入托盘、托盘可恢复窗口、任务完成通知弹出
