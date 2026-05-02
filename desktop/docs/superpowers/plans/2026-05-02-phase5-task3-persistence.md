# Phase 5 Task 3（数据持久化与交互闭环）Implementation Plan

> 执行目标：把“运行 → 落盘 → 历史可见 → 一键 rerun”串成闭环；对不支持输出目录的 MediaCrawler 自动降级到复制模式，并给出日志提示。

---

## 3.P1：Main 侧 run 生命周期管理（runId/runDir/meta.json）

- [ ] 新增 `electron/main/runRegistry.ts`
  - 生成 `runId`
  - 计算 `runDir = <resultsRoot>/runs/<runId>`
  - 写入 meta.json（running/started_at_ms/cli_args/platform/mode…）
  - 提供 `finalizeRun({ status, finished_at_ms, error_message })`
- [ ] 在 `ProcessManager.startTask` 调用前创建 run（并把 runId/runDir 返回给调用方）
- [ ] 在 `child.on('exit')` 时调用 finalizeRun 并更新 meta

验收：
- 只要点“开始任务”，立刻就能在 runs 下看到 run 目录与 meta.json（即使任务还没跑完）

---

## 3.P2：输出目录注入 + 支持探测（--output-dir / RESULTS_DIR）

- [ ] 新增 `electron/main/outputDirSupport.ts`
  - `detectSupportsOutputDirArg(python, entry): Promise<boolean>`
  - 缓存结果（进程内单例）
- [ ] startTask 时：
  - 总是注入 env：`RESULTS_DIR=<runDir>`
  - 若 supportsOutputDirArg=true，追加 args：`--output-dir <runDir>`
- [ ] 支持环境变量 `MEDIA_CRAWLER_DEFAULT_RUNS_ROOT`，默认 `/workspace/MediaCrawler/results/runs/`

验收：
- 当 MediaCrawler 支持 output-dir：产物直接写入 runDir
- 当不支持：不因未知参数退出

---

## 3.P3：自动复制模式（任务结束后搬运产物）

- [ ] 新增 `electron/main/autoCopyRuns.ts`
  - `maybeCopyArtifacts({ runDir, startedAt, finishedAt, defaultRunsRoot })`
  - 扫描 + 选取候选 run 目录（存在 mvp_report.md，且 mtime 在窗口内）
  - 复制到 runDir（递归 copy）
- [ ] 当 runDir 不存在 `mvp_report.md` 时触发 copy
- [ ] copy 模式触发后：
  - 更新 meta：`warning:'auto_copy_mode'`
  - 发送 WARN 日志：`已启用自动复制模式…`

验收：
- 不支持 output-dir 的情况下，仍能在 runDir 中看到 mvp_report.md（若默认目录中存在）
- 若找不到可复制源目录：meta 记录 warning/error，不阻塞退出

---

## 3.P4：IPC/Preload：返回 runId/runDir，并保持兼容

- [ ] 新增 IPC `task:startWithRun`（推荐新接口）
  - 返回 `{ ok, runId, runDir, error? }`
- [ ] preload 增加 `startTaskWithRun(args/env)`（或保持命名为 `startTask` 但扩展返回字段）
- [ ] 保持旧 `task:start` 可用（向后兼容 Task 2/3 现有 UI）

验收：
- Renderer 可拿到 runId 并在 UI 中关联本次 run（例如导出、预览）

---

## 3.P5：History 一键 rerun（回填表单 + 启动新 run）

- [ ] 在 History UI 增加“重新运行”按钮
- [ ] 解析 `meta.cli_args` → 回填 TaskConfig state（只回填白名单字段）
- [ ] 切换到“任务”页并自动开始新任务（生成新 runId）

验收：
- 点击 rerun 后 TaskConfig 立刻展示参数，并启动任务

---

## 3.P6：回归验证

- [ ] `npx tsc -p tsconfig.json --noEmit`
- [ ] `node --test`（新增单测覆盖 output-dir 探测与 auto-copy）
- [ ] `npm run dev` 集成：跑一次任务后 runs 目录落盘、重启后历史可见、rerun 可启动

