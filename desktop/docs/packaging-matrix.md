# Packaging Matrix（Windows/macOS）

## 重要前提

- 不做交叉编译：必须在目标 OS 的构建机上执行 `npm run package`
- 本阶段不做签名/公证：
  - macOS 可能需要用户手动在系统设置里“仍要打开”
  - Windows 可能提示“未知发布者”

## 资源清单（Manifest）

运行时选择顺序：
1. `OMNI_MANIFEST_PATH`（强制覆盖，便于内测/灰度）
2. `resources-manifest.<platform>.<arch>.json`
3. `resources-manifest.json`

可用文件：
- `resources-manifest.win.x64.json`
- `resources-manifest.win.arm64.json`
- `resources-manifest.darwin.x64.json`
- `resources-manifest.darwin.arm64.json`
- `resources-manifest.linux.x64.json`

校验：

```bash
cd /workspace/desktop
npm run manifest:validate
```

## Python bundle（PyInstaller）

构建输出：
- `python_dist/<platform>/<arch>/omni-backend(.exe)`
- `python_dist/selected/omni-backend(.exe)`（electron-builder 打包只拷贝 selected）

单独构建：

```bash
cd /workspace/desktop
python3 scripts/build_python_bundle.py --platform <win|darwin|linux> --arch <x64|arm64>
```

## Windows

### Windows x64

在 Windows x64 构建机：

```powershell
cd desktop
npm install
npm run manifest:validate
python scripts\\build_python_bundle.py --platform win --arch x64
npm run package
```

产物（默认）：
- `desktop\\dist\\OmniScraper-<version>-Setup.exe`

### Windows arm64

说明：Playwright 的 Chromium 下载源目前没有稳定的 `chromium-win-arm64.zip`（会返回 400/404），因此 `resources-manifest.win.arm64.json` 复用 `chromium-win64.zip`，在 Windows arm64 上通过系统的 x64 兼容层运行。

在 Windows arm64 构建机：

```powershell
cd desktop
npm install
npm run manifest:validate
python scripts\\build_python_bundle.py --platform win --arch arm64
npm run package
```

## macOS

### macOS x64

在 macOS x64 构建机：

```bash
cd desktop
npm install
npm run manifest:validate
python3 scripts/build_python_bundle.py --platform darwin --arch x64
npm run package
```

产物（默认）：
- `desktop/dist/OmniScraper-<version>.dmg`

### macOS arm64

在 macOS arm64 构建机：

```bash
cd desktop
npm install
npm run manifest:validate
python3 scripts/build_python_bundle.py --platform darwin --arch arm64
npm run package
```

## GitHub Actions

仓库内置工作流：`.github/workflows/build-installers.yml`

- 打 tag（例如 `v0.1.0`）会触发构建并自动生成 Release 附件
- 也支持 Actions 页面手动触发（workflow_dispatch）
- Windows arm64 需要 self-hosted runner（GitHub hosted runner 暂不提供）
