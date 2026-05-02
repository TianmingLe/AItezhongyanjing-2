# Phase 5 Task 3（数据持久化与交互闭环）Design Spec

## 目标

- 任务运行后，产物（`mvp_report.md`/`meta.json`）最终落到 `~/OmniScraperExports/runs/<runId>/`
- App 重启后，“历史任务”可从磁盘扫描并展示
- “一键重新运行”从历史任务复用参数回填表单并启动新任务（新 runId，不覆盖旧产物）
- 若 MediaCrawler 不支持自定义输出目录，自动切换“复制模式”并在日志中提示

## 现状与约束

- 子进程启动与日志解析：`electron/main/processManager.ts`（Task 2 已验收）
- results root 与 runs 扫描：`electron/main/resultsManager.ts` + preload 白名单 `listRuns/readRunReport`
- 不能在 Renderer 直接使用 `fs`，所有文件操作必须走 preload 白名单

## 目录与协议

### results root 与 run 目录

- results root：`app.getPath('home')/OmniScraperExports`（开发可 `OVERRIDE_RESULTS_ROOT` 覆盖）
- run 目录：`<resultsRoot>/runs/<runId>/`
- runId：`YYYYMMDD_HHmmss_<platform>_<mode>_<random6>`（由 Main 生成）

### meta.json（写入/更新原则）

- start 前创建 runDir 并写入 meta.json（保证列表可见且“running”可显示）
- stop/exit 后补齐：
  - `finished_at_ms`
  - `status`: `success|failed|stopped`
  - `error_message`（失败时）
  - `video_count`（可选，若后续可统计）
- **敏感信息不落盘**：api-key 不写入 meta.json，不写入 stdout/stderr 日志

## 输出路径注入（Output Directory Injection）

### 注入策略（推荐：安全优先）

1. 总是注入环境变量：
   - `RESULTS_DIR=<runDir>`
2. 仅当探测到支持时，额外追加 CLI 参数：
   - `--output-dir <runDir>`

原因：
- 未知 CLI 参数可能导致 MediaCrawler 直接退出（破坏任务）
- env 注入对不支持的脚本通常是“无害的”

### 支持探测（cache）

在 Main 进程首次启动任务前探测并缓存：

- 执行：`python -u <entryPath> --help`
- 判断：stdout/stderr 中是否出现 `--output-dir`
- 缓存：`supportsOutputDirArg: boolean | null`

### 默认输出目录（复制模式扫描根）

- 环境变量优先：`MEDIA_CRAWLER_DEFAULT_RUNS_ROOT`
- 默认值：`/workspace/MediaCrawler/results/runs/`

## 自动复制模式（Fallback Copy Mode）

触发条件：

- 子进程退出后，`<runDir>/mvp_report.md` 不存在（或 runDir 没有任何预期文件）

复制策略：

- 扫描 `defaultRunsRoot` 下的子目录
- 候选目录筛选：
  - 在 `started_at_ms..finished_at_ms+grace(2min)` 时间窗内 mtime/ctime 最新
  - 目录内存在 `mvp_report.md`（硬条件）
- 选取“最匹配”的一个目录作为 source，将其 **复制** 到 `<runDir>`（不移动源目录，避免误删）
- 写入/修复 `<runDir>/meta.json`：
  - `warning: 'auto_copy_mode'`
  - `copied_from: <sourceDir>`（可选字段）
- 通过 `ProcessManager.emit(log WARN)` 输出一条提示：
  - `已启用自动复制模式（MediaCrawler 不支持自定义输出目录或未写入 RESULTS_DIR）`

失败处理：

- 若扫描不到候选目录：保持 meta.status 与 error_message，不阻塞关闭流程；再输出一条 WARN 说明未找到可复制产物

## History 持久化加载

- Renderer 通过 preload：`listRuns()` 扫描 `<resultsRoot>/runs/` 并读取每个 `meta.json`
- 列表不依赖内存态，重启仍可恢复

## 一键重新运行（Rerun）

### 数据来源

- 优先使用 meta.json 的 `cli_args`（字符串数组）
- 若缺失：禁用“重新运行”按钮并显示提示（建议重新运行以生成元数据）

### UI 行为

- History 列表选中后，在 ReportPreview 顶部增加“重新运行”
- 点击后：
  1. 将 nav 切换到“任务”页
  2. 将 `cli_args` 解析回填到 TaskConfig 表单（仅回填受支持字段）
  3. 自动触发一次 `startTask()`（Main 会生成新的 runId，避免覆盖）

### 回填范围（最小可用）

- `--platform`
- `--specified_id` / `--keyword` / `--limit`
- `--ocr-enabled`
- `--comment-depth`
- `--enable-llm` / `--llm-model` / `--llm-base-url`
- api-key 永不回填（需要用户重新输入或依赖环境变量）

## API 变更（Main/Preload）

新增 preload 白名单：

- `createRunAndStartTask(payload)`（推荐新接口，原 `startTask` 仍保留兼容）
  - 入参：`{ args: string[], env?: Record<string,string> }`
  - 出参：`{ ok: true, runId: string, runDir: string } | { ok:false, error:string }`

可选新增：

- `results:readRunMeta(runId)`（若 UI 需要按需读取最新 meta；否则 listRuns 已够用）

## 测试与验收

- 单测：
  - 支持探测（mock `--help` 输出）
  - auto-copy 扫描算法（在 tmp 目录模拟 run 产物）
  - runId 校验/路径穿越防护
- 集成：
  - 运行任务后 `<runDir>` 必有 `meta.json`；若脚本支持，必有 `mvp_report.md`
  - 重启后历史仍在
  - 点击 rerun：参数回显并启动新任务（新 runId）
  - 不支持 output-dir 时日志出现“已启用自动复制模式”
