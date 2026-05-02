# Phase 5 Task 2.4/2.5 端到端集成验收报告

## 结论

- 场景 1（启动+日志流）：通过（stdout 解析为结构化事件、WS 收到实时事件、UI 终端可滚动渲染）
- 场景 2（优雅停止+清理）：通过（SIGTERM → stopped，未发现残留 python 进程）
- 场景 3（WS 断线重连+backlog）：通过（重连后首包 InitEvent，且 InitEvent/backlog 存在）
- 场景 4（异常退出+兜底）：通过（SIGKILL 后 StatusEvent=error，且事件仍通过 IPC 兜底写入）

> 说明：当前沙盒环境下 `/workspace/MediaCrawler/main.py` 不存在，因此使用 `MEDIA_CRAWLER_ENTRY=/workspace/desktop/tests/mock_mediacrawler.py` 来验证端到端链路，不涉及对 `/workspace/MediaCrawler` 的任何修改。真实环境把 `MEDIA_CRAWLER_ENTRY` 去掉即可默认指向 `/workspace/MediaCrawler/main.py`。

## 环境与入口

- 启动入口：`/workspace/desktop/electron/main/index.ts`
- 子进程封装：`/workspace/desktop/electron/main/processManager.ts`
- WS 服务：`/workspace/desktop/electron/main/logServer.ts`
- Preload API：`/workspace/desktop/electron/preload/index.ts`
- Renderer UI：`/workspace/desktop/src/App.tsx` + `/workspace/desktop/src/components/Terminal.tsx`

## 验收场景与证据

### 场景 1：正常启动 + 日志流

执行（自动化点击 Start）：

```bash
cd /workspace/desktop
MEDIA_CRAWLER_ENTRY=/workspace/desktop/tests/mock_mediacrawler.py \
E2E_AUTORUN=1 \
E2E_LOG_PATH=/workspace/desktop/e2e_artifacts/events.ndjson \
E2E_WSINFO_PATH=/workspace/desktop/e2e_artifacts/wsinfo.json \
xvfb-run -a npm run dev
```

证据（Main 侧记录到 NDJSON）：
- 产物文件：
  - `/workspace/desktop/e2e_artifacts/events.ndjson`
  - `/workspace/desktop/e2e_artifacts/wsinfo.json`
- 关键片段（启动/日志）：见 `events.ndjson` 头部：

```json
{"source":"pm","ev":{"type":"status","status":"starting","timestamp":1777687851011}}
{"source":"pm","ev":{"type":"status","status":"running","timestamp":1777687851022}}
{"source":"pm","ev":{"type":"log","level":"INFO","module":"mock","message":"start platform=dy pipeline=mvp specified_id=test-id","stream":"stdout","timestamp":1777687851629}}
{"source":"pm","ev":{"type":"log","level":"PROGRESS","module":"mock","message":"tick=1","stream":"stdout","timestamp":1777687851630}}
```

### 场景 2：优雅停止 + 资源清理

同一轮 E2E 自动化里触发 Stop（20s）：

```json
{"source":"pm","ev":{"type":"status","status":"stopping","timestamp":1777687858812}}
{"source":"pm","ev":{"type":"log","level":"SUCCESS","module":"mock","message":"received SIGTERM, exiting","stream":"stdout","timestamp":1777687858814}}
{"source":"pm","ev":{"type":"status","status":"stopped","timestamp":1777687858827,"detail":"exit:0:null"}}
```

进程清理检查（示例命令）：

```bash
pgrep -af mock_mediacrawler.py || echo no_mock_process
```

在验收时未发现残留 python/mock 进程。

### 场景 3：WebSocket 断线重连 + backlog 补齐

WS 客户端验证脚本：
- `/workspace/desktop/scripts/ws_capture.mjs`

执行（在 Electron 运行期间建立 WS 连接，主动断开后重连）：

```bash
node /workspace/desktop/scripts/ws_capture.mjs \
  /workspace/desktop/e2e_artifacts/wsinfo.json \
  /workspace/desktop/e2e_artifacts/ws_capture.ndjson
```

证据（`ws_capture.ndjson`）：

```json
{"event":"first_session","initCount":1,"msgCount":6}
{"event":"second_session","initCount":1,"msgCount":7}
```

说明：
- 每次连接都收到 `InitEvent`（`initCount=1`），且消息条数大于 0，证明 backlog 首包生效。
- Renderer 侧实现了去重 key（避免 backlog 重放造成重复），并在 UI 提供 “WS 断线” 按钮模拟断线重连。

### 场景 4：异常处理 + 兜底通道

执行（启动后由 Main 侧注入 `SIGKILL`，模拟 kill -9）：

```bash
cd /workspace/desktop
MEDIA_CRAWLER_ENTRY=/workspace/desktop/tests/mock_mediacrawler.py \
E2E_AUTORUN=1 \
E2E_KILL9=1 \
E2E_LOG_PATH=/workspace/desktop/e2e_artifacts_kill9/events.ndjson \
xvfb-run -a npm run dev
```

证据（`e2e_artifacts_kill9/events.ndjson`）：

```json
{"source":"pm","ev":{"type":"status","status":"error","timestamp":1777687897438,"detail":"exit:null:SIGKILL"}}
```

说明：
- 进程异常退出被捕获并转为 `StatusEvent(status='error')`。
- 即使 WS 出现问题，Main 仍会通过 `webContents.send('log:event', ev)` 进行 IPC 兜底（Renderer 侧在 WS 未连接时消费 IPC）。

## 演示 GIF

- `/workspace/desktop/e2e_artifacts_gif/demo.gif`

## 额外说明（沙盒差异）

- Electron 在 CI/sandbox 中运行会有 dbus / GPU 相关报错（不影响本次验证核心链路：spawn/pipe/WS/IPC）。
- `/workspace/MediaCrawler` 缺失导致无法执行真实抓取流程；链路验证使用 mock 脚本代替，确保不触碰 MediaCrawler 代码。
