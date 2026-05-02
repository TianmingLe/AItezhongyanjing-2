# Phase 5 Task 4（Windows/macOS 打包）Design Spec

## Goal

- 产出 Windows/macOS 安装包（暂不做签名/公证）
- 支持架构：
  - Windows：x64 + arm64
  - macOS：x64 + arm64（两份 dmg，不做 universal）
- 运行时按平台/架构自动选择对应 resources manifest，确保下载正确资源
- 打包产物包含：
  - Electron 应用
  - Python bundle（PyInstaller onefile）
  - 对应平台/架构的 manifest

## Non-goals

- 不在本阶段完成代码签名/公证（Notarization）与自动更新
- 不在本阶段实现“单一 universal dmg”

## Manifest strategy（多文件，强一致）

### Naming

使用多份 manifest，每份只描述一个 `platform+arch` 的资源集合：

- `resources-manifest.win.x64.json`
- `resources-manifest.win.arm64.json`
- `resources-manifest.darwin.x64.json`
- `resources-manifest.darwin.arm64.json`
- `resources-manifest.linux.x64.json`

保留 `resources-manifest.json` 作为 fallback（默认指向 linux x64 或仅做开发演示）。

### Runtime selection order

1. `OMNI_MANIFEST_PATH`（强制覆盖，用于灰度/内测）
2. `resources-manifest.<platform>.<arch>.json`
3. `resources-manifest.json`

其中：
- `platform`：`win` / `darwin` / `linux`
- `arch`：`x64` / `arm64`

### Validation

每份 manifest 在打包阶段必须执行校验（schema + dest 安全 + sha256）。

## Python bundle strategy（每平台独立构建）

PyInstaller onefile 不支持跨 OS 交叉构建，因此需要在目标 OS 上构建对应 bundle：

- Windows runner（x64、arm64）
- macOS runner（x64、arm64）

输出规范（建议扩展）：
- `python_dist/<platform>/<arch>/omni-backend(.exe)`

## Electron builder strategy

### Targets

- Windows：NSIS（x64 + arm64）
- macOS：DMG（x64 + arm64）

### Packaging rules

- `extraResources`：
  - `python_dist/<platform>/<arch>/` → `resourcesPath/python/`
  - `resources-manifest*.json` → `resourcesPath/` 或留在 asar（只读即可）

## Acceptance

- 在目标 OS 上可产出安装包（暂不签名）
- 安装后首次启动可下载资源（对应平台/arch 的 manifest）
- 能运行一次 detail 任务并在 `~/OmniScraperExports/runs/` 产出报告
