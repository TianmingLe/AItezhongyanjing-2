# Phase 5 Task 4（打包分发配置）Design Spec

## Goal

- 产出跨平台安装包（Windows/macOS/Linux），安装后无需用户配置 Python 即可运行
- 首次启动自动检测并下载大件资源（Playwright 浏览器、OCR/ASR 模型），带进度展示
- Python 后端采用 PyInstaller 打成单一可执行文件，**不内置** Playwright 浏览器与大模型
- 开发环境仍可用系统 python3 + 源码运行，路径可配置

## Non-goals

- 不在此阶段实现资源镜像/CDN、多线程下载优化
- 不在此阶段实现 Playwright/OCR 模型的细粒度版本管理（仅做存在性校验 + 可选校验文件）

## Repo layout

- MediaCrawler 源码默认在：`desktop/vendor/MediaCrawler`
- 开发覆盖：`MEDIA_CRAWLER_SRC=/abs/path/to/MediaCrawler`
- 资源落盘：`~/OmniScraperExports/resources/`

## Python bundle (PyInstaller onefile)

### Build script

新增：`desktop/scripts/build_python_bundle.py`

职责：
- 校验/同步 MediaCrawler 到 `vendor/MediaCrawler`（打包阶段强制 vendor 存在）
- 创建临时 venv，安装依赖（自动探测）
- PyInstaller 构建 onefile：
  - 输出：`desktop/python_dist/<platform>/omni-backend(.exe)`
  - 入口：`vendor/MediaCrawler/main.py`（或 vendor 内可配置入口）
- 排除大件资源：
  - 不捆绑 Playwright 浏览器目录
  - 不捆绑 whisper/ocr 模型文件（只保留代码依赖）

### Dependency discovery

优先级：
1. `requirements.txt`
2. `pyproject.toml`（基于 PEP517 pip 安装）

## Resource Manager (first-run download)

新增：`desktop/src/services/resourceManager.ts`

### State machine

- `checking` → `downloading` → `ready` | `error`
- UI：在 `App` 启动阶段展示“环境初始化”进度条；未 ready 前禁用开始任务

### Transport

- Renderer 不直接下载大文件
- 通过 preload 白名单调用：`resources.ensure()`，Main 执行下载并通过 `resources.onProgress` 回推进度

### Backend responsibility

由 Python 后端提供子命令：
- `omni-backend --setup-resources`
  - 负责下载/安装 Playwright 浏览器（到 `PLAYWRIGHT_BROWSERS_PATH`）
  - 负责下载 OCR/ASR 模型（到 `OMNI_MODELS_DIR`）
  - 进度输出格式沿用现有日志解析：`[PROGRESS] ...` / `[INFO] ...` / `[ERROR] ...`

## Electron packaging (electron-builder)

### package.json

- 增加依赖 `electron-builder`
- scripts：
  - `build`：`electron-vite build`
  - `package`：串联 `build` + `build_python_bundle.py` + `electron-builder`

### build config

- `files`：包含 `out/**`
- `extraResources`：包含 `python_dist/**`（不进 asar）
- `asar`：允许 renderer/main/preload 进 asar；Python bundle 必须在 extraResources

### Runtime path resolution

- 生产环境：使用 `process.resourcesPath` 定位 `python_dist/.../omni-backend`
- 开发环境：用 `python3` + `MEDIA_CRAWLER_SRC/main.py`

## ProcessManager production/dev switch

修改 `electron/main/processManager.ts`：
- dev：`spawn(python3, ['-u', entryPath, ...args])`
- prod：`spawn(omniBackendExe, [...args])`

并统一注入 env：
- `PLAYWRIGHT_BROWSERS_PATH=~/OmniScraperExports/resources/playwright-browsers`
- `OMNI_MODELS_DIR=~/OmniScraperExports/resources/models`
- `XDG_CACHE_HOME=<userData>/cache`（Linux）等 cache 目录指向 userData

## Acceptance

- `npm run package` 可生成安装包
- 安装后无需 python 配置即可运行
- 首次启动自动下载资源并显示进度，完成后可开始任务
- 任务正常启动/运行/结束
