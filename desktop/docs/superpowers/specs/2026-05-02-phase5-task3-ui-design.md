# Phase 5 Task 3 Design Spec：桌面端专业 UI（任务配置 / 实时终端 / 报告预览 / 导出 / 托盘）

## 目标

在不破坏 Phase 5 Task 2 现有 IPC/WS/进程管理接口的前提下，完成一套专业桌面交互体验：

- 任务配置面板：生成合法 CLI 参数并启动任务
- 实时终端：稳定承载长任务日志（保留最近 2000 条，避免卡顿）
- 历史任务：扫描持久化 runs 目录，快速加载（10 个任务 < 500ms）
- 报告预览：Markdown 渲染 + 代码高亮 + 导出（Markdown/PDF/JSON）
- 托盘与通知：关闭/最小化都隐藏到托盘，任务结束通知

## 范围与非目标

### 范围

- UI（Renderer）：Sidebar + TaskConfig + HistoryList + ReportPreview + Terminal
- Main：results root 管理、run 扫描/读取、导出、托盘、通知
- Preload：新增白名单 API（文件读取/导出/扫描）与严格 type guard

### 非目标

- 不在本任务中修改 `/workspace/MediaCrawler` 代码
- PDF 中文字体嵌入暂不实现（先用 `printToPDF`，并在 UI 明确提示中文依赖系统字体）
- 多任务队列/并发执行（本任务仍以单活动任务为主；为后续扩展预留 TaskRegistry 结构）
- 终端虚拟列表（本任务先用 2000 条滑窗缓冲；如需更大规模再加虚拟列表）

## 现有基础（来自 Task 2）

### 子进程与日志

- Main：`ProcessManager` + `LogServer`
- WS：动态端口 + token，首次连接发送 `InitEvent{ backlog }`
- IPC fallback：`webContents.send('log:event', ev)`

### Preload API（已存在）

- `startTask(config: StartTaskConfig)`
- `stopTask()`
- `onLog(cb)`
- `getLogStreamInfo()`

本任务在此基础上扩展文件能力与导出能力，但不改动这些 API 的语义。

## 目录与数据契约

### results root（持久化目录）

- 默认：`<home>/OmniScraperExports`
  - Main 使用 `app.getPath('home')`
- 可覆盖（开发/测试）：`process.env.OVERRIDE_RESULTS_ROOT`
- runs 目录：`<resultsRoot>/runs/`
- 启动时确保目录存在；无权限时返回明确错误（供 UI 展示）

### run 目录结构（约定）

每个 run 目录：`<resultsRoot>/runs/<runId>/`

- `meta.json`（必选，若缺失则降级）
- `mvp_report.md`（可选，预览时读取；不存在则提示“报告未生成”）

#### meta.json Schema（示例）

```ts
type RunMeta = {
  run_id: string
  created_at_ms: number
  started_at_ms?: number
  finished_at_ms?: number
  status: 'running' | 'success' | 'failed' | 'stopped'
  platform?: 'dy' | 'xhs' | 'bili'
  mode?: 'detail' | 'search'
  specified_id?: string
  keyword?: string
  limit?: number
  ocr_enabled?: boolean
  comment_depth?: number
  enable_llm?: boolean
  llm_model?: string
  llm_base_url?: string
  video_count?: number
  error_message?: string
  cli_args?: string[]
}
```

安全策略：

- `api-key` 不落盘（不写入 meta.json，不写入日志/报告）
- 如果用户输入 api-key：仅通过 IPC 传递给 Main，在 Main 侧作为环境变量注入子进程

### runId 生成规则

- `YYYYMMDD_HHmmss_<platform>_<mode>_<random6>`
- 不要求与 MediaCrawler 内部 run_id 一致（如果 MediaCrawler 能接受 output-dir，则 report 落在该 run 目录即可）

## UI 信息架构（Renderer）

### 页面结构

- 左侧 Sidebar
  - 任务（默认页）
  - 历史
- 右侧主区域
  - 任务页：TaskConfig + Terminal +（可选）ReportPreview（当前 run）
  - 历史页：HistoryList + ReportPreview

### 组件结构与接口

#### Sidebar

```ts
type NavKey = 'run' | 'history'

type SidebarProps = {
  active: NavKey
  onChange: (next: NavKey) => void
}
```

#### TaskConfig

```ts
type Platform = 'dy' | 'xhs' | 'bili'
type Mode = 'detail' | 'search'

type TaskFormState = {
  platform: Platform
  mode: Mode
  specified_id: string
  keyword: string
  limit: number
  advancedOpen: boolean
  ocr_enabled: boolean
  comment_depth: number
  enable_llm: boolean
  llm_model: string
  llm_base_url: string
  llm_api_key: string
}

type TaskConfigProps = {
  busy: boolean
  onStart: (config: { args: string[]; env?: Record<string, string> }) => Promise<void>
  onStop: () => Promise<void>
}
```

校验规则：

- platform 必填
- mode=detail：specified_id 必填
- mode=search：keyword 必填；limit > 0
- 高级参数：
  - comment_depth >= 0
- enable_llm 时：
  - llm_model/llm_base_url 必填
  - llm_api_key 可选（若不填给出“可使用环境变量”提示）

可访问性与交互（必须满足）：

- 表单控件必须有 `<label>` 或 `aria-label`（包括下拉、输入框、开关、折叠面板）
- 输入框必须设置 `name` 与合适的 `autoComplete`（避免密码管理器误触发）
- placeholder 以 `…` 结尾（例如 `关键词…`、`指定 ID…`）
- 所有按钮/可交互元素必须有清晰的 `:focus-visible` 样式（深色主题必须显式可见）

#### Terminal（增强）

```ts
type TerminalProps = {
  items: Array<import('@shared/protocol').EventEnvelope>
  cap: number // 固定 2000
}
```

性能策略：

- renderer 内存最多保留 2000 条日志行
- 去重：对 `InitEvent.backlog` 合并时去重（避免断线重连重复）
- 列表项 key 使用稳定 key（不得使用 index），避免重排导致滚动跳动
- 自动滚动仅在“用户已接近底部”时生效；用户上滚查看历史时暂停自动滚动，并提供“n 条新日志”跳转按钮（可延后实现，但必须预留结构）
- 语义：终端容器使用 `role="log"` + `aria-live="polite"` + `aria-relevant="additions"`

#### HistoryList（左侧列表）

```ts
type RunItem = {
  run_id: string
  created_at_ms: number
  status: 'running' | 'success' | 'failed' | 'stopped' | 'unknown'
  platform?: string
  keyword?: string
  specified_id?: string
}

type HistoryListProps = {
  items: RunItem[]
  selectedRunId?: string
  onSelect: (runId: string) => void
  onRefresh: () => Promise<void>
}
```

加载策略：

- App 启动进入“历史”页时拉取一次 listRuns
- 读取 10 个 meta.json < 500ms（Main 侧并发读取 + 失败降级）
- 缺失 meta.json 的降级策略（向后兼容）：
  - 优先从目录名推断（低成本）
  - 如需读取报告内容推断，只读取文件前 N 行（例如 50 行），避免大文件阻塞

#### ReportPreview

```ts
type ExportFormat = 'markdown' | 'pdf' | 'json'

type ReportPreviewProps = {
  runId?: string
  markdown?: string
  warning?: string
  onExport: (format: ExportFormat, runId: string) => Promise<void>
}
```

渲染方案：

- `react-markdown`
- `remark-gfm`
- `rehype-highlight`

PDF 提示（必须在顶部显式展示）：

> “中文显示取决于系统字体，若缺字请使用 Markdown 导出”

## Main/Preload API 契约

### IPC Channels（Main 内部约定）

- `results:getRoot`
- `results:listRuns`
- `results:readRunFile`
- `export:save`（统一导出入口）
- `dialog:save`（如需要分离）

### Preload 暴露（新增）

```ts
type RunMeta = {
  run_id: string
  created_at_ms: number
  status: 'running' | 'success' | 'failed' | 'stopped' | 'unknown'
  platform?: string
  mode?: string
  specified_id?: string
  keyword?: string
  limit?: number
  error_message?: string
  cli_args?: string[]
}

type ExportRequest = {
  runId: string
  format: 'markdown' | 'pdf' | 'json'
}

type ExportResult = { ok: true; path: string } | { ok: false; error: string }

interface ElectronAPI {
  startTask(config: import('@shared/protocol').StartTaskConfig): Promise<{ ok: boolean; error?: string }>
  stopTask(): Promise<{ ok: boolean; error?: string }>
  onLog(cb: (ev: import('@shared/protocol').EventEnvelope | import('@shared/protocol').InitEvent) => void): () => void
  getLogStreamInfo(): Promise<{ wsUrl: string; token: string }>

  getResultsRoot(): Promise<{ ok: true; path: string } | { ok: false; error: string }>
  listRuns(): Promise<{ ok: true; items: RunMeta[] } | { ok: false; error: string }>
  readRunReport(runId: string): Promise<{ ok: true; markdown: string } | { ok: false; error: string }>
  exportFile(req: ExportRequest): Promise<ExportResult>
}
```

Type guard 要求：

- 所有入参/出参拒绝未知字段
- `runId` 必须是简单字符串（不允许路径穿越），Main 再次校验并 join

## 导出设计

### 导出路径默认值

- 默认建议目录：`<home>/OmniScraperExports/exports/`
- UI 点击导出时弹出 `dialog.showSaveDialog`
- 未选择路径：返回 `{ ok:false, error:'canceled' }`（UI 不报错，仅提示取消）

### Markdown 导出

- 读取 `<runDir>/mvp_report.md`，写入用户选择路径

### JSON 导出

- 读取 `<runDir>/meta.json`（存在则写出）
- 可选：连同 `cli_args` 与 `error_message`

### PDF 导出（本阶段）

流程：

1. Main 创建隐藏 `BrowserWindow({ show:false })`
2. 将 Markdown 渲染为 HTML 字符串（Main 内部用极简模板：标题/代码块/表格样式；保持可打印）
3. `win.loadURL('data:text/html;base64,...')` 或 `loadFile` 临时 html
4. `webContents.printToPDF({ pageSize:'A4', printBackground:true, marginsType: 1 })`
5. 保存到用户选择路径
6. 销毁隐藏窗口

提示策略：

- ReportPreview 顶部提示中文字体依赖系统字体
- 提供“导出 Markdown”作为稳定备选
- 若无法精确设置 1cm 边距：退回 `marginsType` 预设，并在日志中记录（不影响导出成功）

## 托盘与通知设计（Main）

### 行为

- 关闭按钮：拦截，隐藏窗口（不退出）
- 最小化：拦截，隐藏窗口
- 首次关闭/最小化时弹出一次提示：“已最小化到托盘”，避免用户误以为退出（可提供“不再提示”预留）
- 托盘菜单：
  - 显示/隐藏窗口
  - 退出应用（真正 quit）

### 通知

- 监听 `ProcessManager` 事件流中的 `StatusEvent`
- 当 `status` 变为 `stopped` 或 `error` 时，发送桌面通知：
  - title：`OmniScraper`
  - body：`任务完成` / `任务失败：<detail>`

## 与 MediaCrawler 的输出目录兼容

启动任务时，Main 优先探测支持：

1. CLI 参数：`--output-dir <path>`（若存在）
2. 环境变量：`OVERRIDE_RESULTS_ROOT=<resultsRoot>`（若 MediaCrawler 支持）

探测方法：

- 运行一次 `python3 /workspace/MediaCrawler/main.py --help`（或在 dev 阶段读取 help 输出）并 regex 查找 `output`/`results` 相关 flags
- 如果两个都不支持：本任务 fallback 为“任务结束后复制/移动”（标记技术债，并在 UI 中提示）

## 测试策略（Task 3）

- 单元测试（node:test）：
  - preload validators：listRuns/readRunReport/exportFile 入参/出参校验
  - resultsManager：目录创建、权限错误、runId 路径校验
- 集成验证：
  - `npm run dev` 下 UI 操作：开始任务→日志滚动→停止→历史出现新 run
  - WS 断线重连：仍能继续输出日志并收到 backlog
  - 导出：Markdown/PDF/JSON 均能写入到指定路径
  - 托盘：关闭/最小化隐藏，托盘菜单可恢复/退出
