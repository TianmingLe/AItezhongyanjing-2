# OmniScraper 报错修复手册（Troubleshooting）

本文档面向使用与运维排障，按“现象 → 原因 → 修复步骤”的方式整理常见问题。

## 1. 启动阶段：环境初始化失败（资源下载/校验）

### 1.1 提示“资源正在被另一个实例下载，请稍后重试”

**原因**
- 同一台机器上同时开了多个 OmniScraper
- 上一次下载异常退出，残留锁

**修复**
- 先关闭其他 OmniScraper 实例
- 等待 30 秒后重试
- 仍失败：重启应用；如果仍不行，删除 `~/OmniScraperExports/resources/.download.lock` 后重试

### 1.2 提示“磁盘空间不足，请清理空间后重试”

**原因**
- 下载资源（浏览器/模型）需要较大磁盘空间

**修复**
- 清理磁盘空间后重启应用
- 或把数据根目录迁移到更大的磁盘（见 `OVERRIDE_RESULTS_ROOT`）

### 1.3 提示“资源校验失败（SHA256 不一致），请重试或更换网络”

**原因**
- 下载被中间层缓存/劫持
- 网络不稳定导致文件损坏

**修复**
- 直接重试（系统内置对校验失败会重试一次）
- 切换网络（公司网/家里网/手机热点）
- 如果开了代理，尝试关闭代理或设置 `NO_PROXY`

### 1.4 提示“网络不可达/网络连接失败或超时”

**原因**
- DNS/网络不可用
- 代理配置错误

**修复**
- 检查是否能访问 GitHub / HuggingFace / Playwright CDN
- 若需代理：设置 `HTTP_PROXY` / `HTTPS_PROXY`
- 若局部域名不走代理：设置 `NO_PROXY`（逗号分隔域名）

### 1.5 提示“下载失败（HTTP 错误）”

**原因**
- 下载源返回 4xx/5xx

**修复**
- 等待一段时间后重试
- 切换网络
- 使用 `OMNI_MANIFEST_PATH` 切换到你们维护的镜像 manifest（如果有）

## 2. 任务阶段：无法启动/立即失败

### 2.1 日志里出现 `bad_config`

**原因**
- UI 参数未填完整，或参数组合不合法

**修复**
- detail 模式必须填写「指定 ID」
- search 模式必须填写「关键词」与合理的 `limit`
- 修正后重新开始任务

### 2.2 日志里出现 `process_already_running`

**原因**
- 当前已有任务在运行（或进程未完全退出）

**修复**
- 在任务页点击“停止任务”
- 等待状态变为 stopped 后再启动
- 仍不行：退出应用重新打开

### 2.3 日志里出现 `dangerous_env_override`

**原因**
- 为了安全，应用拒绝某些危险的环境变量覆盖（防止注入/破坏运行环境）

**修复**
- 不要在任务参数里注入不受信任的 env
- 需要代理请使用 `HTTP_PROXY/HTTPS_PROXY/NO_PROXY` 这类允许的变量

## 3. 报告阶段：报告无法读取/导出失败

### 3.1 “报告生成失败，请检查日志”

**原因**
- 任务失败或未生成 `mvp_report.md`

**修复**
- 先在“终端日志”里定位错误
- 到数据目录检查对应 run：
  - `~/OmniScraperExports/runs/<runId>/mvp_report.md` 是否存在
  - `~/OmniScraperExports/runs/<runId>/meta.json` 看 `status` 与 `error_message`

### 3.2 导出失败：`canceled`

**原因**
- 你在保存对话框里取消了导出

**修复**
- 重新导出即可

### 3.3 导出失败：`export_pdf_failed:*` / `export_markdown_failed:*` / `export_json_failed:*`

**原因**
- 文件系统权限不足
- 目标路径不可写、磁盘满

**修复**
- 换一个可写目录（例如桌面/下载）
- 检查磁盘空间
- Windows：尽量不要保存到需要管理员权限的目录

## 4. 历史页问题

### 4.1 历史列表为空或报 `list_runs_failed:*`

**原因**
- 数据目录不可读/不可写

**修复**
- 检查 `~/OmniScraperExports` 是否存在、是否有权限
- 若你配置了 `OVERRIDE_RESULTS_ROOT`，确认路径存在且可写

### 4.2 点击历史任务后报 `bad_run_id`

**原因**
- runId 校验失败（可能是目录名被手工改坏/包含非法字符）

**修复**
- 不要手工改 run 目录名
- 如果已经改坏：把该目录移走或改回只包含 `A-Za-z0-9._-` 的名称

## 5. 一键卸载相关

### 5.1 卸载失败：`unsafe_delete_target`

**原因**
- 为了避免误删，卸载只允许删除 Home 目录下的目标路径；如果你把数据目录指到 `/tmp`、`/` 等位置会被拒绝

**修复**
- 将 `OVERRIDE_RESULTS_ROOT` 指向 Home 目录下路径（例如 `~/OmniScraperExports` 或 `~/Documents/OmniScraperExports`）
- 再执行卸载

### 5.2 Windows 无法自动打开卸载器

**原因**
- NSIS 卸载器路径不固定，且权限/安装路径可能不同

**修复**
- 打开系统“应用和功能/程序和功能”，手动卸载 OmniScraper

### 5.3 macOS 卸载方式

**修复**
- 打开 Applications，把 `OmniScraper.app` 拖到废纸篓

### 5.4 Linux AppImage 卸载方式

**修复**
- 删除你下载的 `*.AppImage` 文件即可
- 如创建了桌面快捷方式，需要手工移除快捷方式

## 6. 收集信息用于反馈

当你需要把问题反馈给研发时，请尽量提供：

- 你使用的平台与安装包版本（Nightly / vX.Y.Z）
- 发生问题时的 runId（任务页顶部会显示 run）
- 对应目录：
  - `~/OmniScraperExports/runs/<runId>/meta.json`
  - `~/OmniScraperExports/runs/<runId>/mvp_report.md`（若存在）
- 终端日志页中最靠近错误的 30-50 行内容

