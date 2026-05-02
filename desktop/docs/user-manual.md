# OmniScraper 桌面版用户手册

本文档面向最终用户，介绍 OmniScraper 桌面版的安装、首次启动、功能使用与数据文件位置。

## 1. 获取安装包（推荐：Nightly）

本项目会持续生成可直接安装/运行的安装包：

- **Nightly（推荐）**：始终指向最新构建（适合日常使用/内测）
- **版本发布（vX.Y.Z）**：固定版本（适合对外发布/回滚）

下载位置：GitHub 仓库的 Releases 页面。

### Windows（x64）

- 文件名一般形如：`OmniScraper-*-Setup.exe`
- 双击 `Setup.exe` → 下一步安装 → 桌面/开始菜单启动

### macOS（Intel / Apple Silicon）

- 文件名一般形如：`OmniScraper-*.dmg`
- 双击 dmg → 将 `OmniScraper.app` 拖入 `Applications` → 从 Launchpad/Applications 打开
- 若提示“无法打开/已损坏”：
  - 打开「系统设置」→「隐私与安全性」→ 找到 OmniScraper → 选择“仍要打开”

### Linux（x64）

- 文件名一般形如：`OmniScraper-*.AppImage`
- 赋予执行权限并运行：

```bash
chmod +x OmniScraper-*.AppImage
./OmniScraper-*.AppImage
```

## 2. 首次启动（环境初始化 / 资源下载）

首次启动会进入「环境初始化」，自动下载并校验运行所需资源（浏览器内核、OCR/模型等）。

- 进度条会显示：检查 → 下载 → 校验 → 解压
- 完成后会进入主界面
- 若失败，界面会显示明确错误信息，可参考 [报错修复手册](troubleshooting.md)

## 3. 界面概览

左侧导航：

- **任务**：配置参数并启动一次抓取/分析任务
- **历史**：查看历史任务、预览报告、重新运行
- **设置**：应用相关功能（含一键卸载/清理）

## 4. 运行任务（任务页）

### 4.1 平台

当前支持：

- 抖音（dy）
- 小红书（xhs）
- B 站（bili）

### 4.2 模式

- `detail`：指定 ID 抓取（用于精确复跑/单条内容）
- `search`：关键词搜索（用于批量获取）

### 4.3 必填项

- detail：
  - **指定 ID**：输入目标内容的 ID
- search：
  - **关键词**：输入关键词
  - **limit**：数量上限

### 4.4 高级参数

- **OCR**：打开后会额外使用 OCR 能力
- **评论深度**：控制评论抓取/分析深度（0 表示不抓评论）
- **启用 LLM**：
  - `model`：模型名称（例如某些平台常用的模型名）
  - `base-url`：OpenAI 兼容接口的 base url
  - `api-key`：API Key（仅用于当前任务；建议优先用环境变量方式注入，避免手工输入）

### 4.5 启动与停止

- 点击 **开始任务**：开始执行
- 点击 **停止任务**：终止当前任务（会在日志中显示“任务已终止”）

任务状态与日志：

- 顶部会显示 `ping` 与 `ws` 状态；`ws: connected` 表示日志流已连接
- 默认在「终端日志」页查看实时日志
- 任务结束后可切换到「分析报告」页查看报告

## 5. 查看报告与导出

在「分析报告」页可：

- **导出 Markdown**
- **导出 PDF**
- **导出 JSON**

导出成功后会显示导出路径；取消导出会显示“已取消导出”。

## 6. 历史任务（历史页）

在「历史」页可：

- 查看历史任务列表
- 选择任务后预览 `mvp_report.md`
- 若该任务的 `cli_args` 存在，可点击 **重新运行** 自动填充参数并再次启动

## 7. 设置（含一键卸载）

### 一键卸载（两次确认）

入口：设置 → 一键卸载

卸载会执行：

1. 清理本机数据目录（默认 `~/OmniScraperExports`，含 runs/exports/resources 等）
2. 清理应用配置与缓存（Electron userData）
3. 尽力打开系统卸载入口/提示，然后退出应用

第二次确认需要输入固定字符串 `UNINSTALL`，避免误操作。

## 8. 数据目录与文件说明

默认数据根目录：

- `~/OmniScraperExports`

目录结构：

- `runs/<runId>/meta.json`：任务元信息（创建时间、状态、参数等）
- `runs/<runId>/mvp_report.md`：报告
- `exports/`：导出的 Markdown/PDF/JSON
- `resources/`：首次启动下载的资源缓存

如果需要迁移/备份，建议直接备份整个 `~/OmniScraperExports`。

## 9. 高级：常用环境变量

以下环境变量主要面向高级用户/排障：

- `OVERRIDE_RESULTS_ROOT`：修改数据输出根目录（默认 `~/OmniScraperExports`）
- `OMNI_MANIFEST_PATH`：强制指定资源 manifest 文件路径（用于灰度/切换资源源）
- `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`：资源下载代理设置

