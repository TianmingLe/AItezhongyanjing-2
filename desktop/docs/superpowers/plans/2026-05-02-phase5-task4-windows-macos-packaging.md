# Phase 5 Task 4（Windows/macOS 打包）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 产出 Windows（x64+arm64）与 macOS（x64+arm64）安装包（暂不签名/公证），并让运行时按平台/架构自动选择对应的 resources manifest；每平台 bundle 的 python_dist 能被 electron-builder 正确打入 extraResources。

**Architecture:** 引入多份 `resources-manifest.<platform>.<arch>.json` 并实现选择器；将 python_dist 输出扩展为 `<platform>/<arch>`；打包脚本按 `--platform/--arch` 组织产物，electron-builder 在各 OS runner 上分别构建对应 target。

**Tech Stack:** Electron 33, electron-builder, electron-vite, Node.js, PyInstaller.

---

## File map

**Create**
- `desktop/scripts/resolve-manifest-path.ts`
- `desktop/resources-manifest.win.x64.json`
- `desktop/resources-manifest.win.arm64.json`
- `desktop/resources-manifest.darwin.x64.json`
- `desktop/resources-manifest.darwin.arm64.json`
- `desktop/resources-manifest.linux.x64.json`
- `desktop/tests/manifestResolver.test.mjs`

**Modify**
- `desktop/electron/main/ipc/resourcesIpc.ts`
- `desktop/scripts/build_python_bundle.py`
- `desktop/package.json`
- `desktop/scripts/validate-manifest.js`

---

### Task 1: Manifest 多文件拆分（按 platform/arch）

**Files:**
- Create: `desktop/resources-manifest.win.x64.json`
- Create: `desktop/resources-manifest.win.arm64.json`
- Create: `desktop/resources-manifest.darwin.x64.json`
- Create: `desktop/resources-manifest.darwin.arm64.json`
- Create: `desktop/resources-manifest.linux.x64.json`
- Modify: `desktop/resources-manifest.json`

- [ ] **Step 1: Add linux.x64 manifest**

Copy current `resources-manifest.json` to `resources-manifest.linux.x64.json`.

- [ ] **Step 2: Define win/mac manifests**

Create manifests with the same schema, but URLs/sha256 matching platform artifacts.

- [ ] **Step 3: Make resources-manifest.json a fallback**

Either:
- keep as linux.x64 mirror
- or keep as minimal dev-only sample

---

### Task 2: Manifest 选择器（runtime）

**Files:**
- Create: `desktop/scripts/resolve-manifest-path.ts`
- Create: `desktop/tests/manifestResolver.test.mjs`
- Modify: `desktop/electron/main/ipc/resourcesIpc.ts`

- [ ] **Step 1: Write failing test**

`tests/manifestResolver.test.mjs`:
- when `OMNI_MANIFEST_PATH` set, return it
- else return `resources-manifest.<platform>.<arch>.json`
- else fallback to `resources-manifest.json`

- [ ] **Step 2: Implement resolver**

`resolveManifestPath({ appRoot, platform, arch, env }) => string`

- [ ] **Step 3: Wire into resourcesIpc**

Replace direct `process.env.OMNI_MANIFEST_PATH || appRoot/resources-manifest.json` with resolver result.

---

### Task 3: validate-manifest 支持多文件

**Files:**
- Modify: `desktop/scripts/validate-manifest.js`
- Modify: `desktop/package.json`

- [ ] **Step 1: Add npm script**

Add `manifest:validate` that validates all `resources-manifest*.json` in repo root.

- [ ] **Step 2: CI/local command**

`node scripts/validate-manifest.js resources-manifest.win.x64.json` 等。

---

### Task 4: build_python_bundle.py 支持 platform/arch 输出

**Files:**
- Modify: `desktop/scripts/build_python_bundle.py`
- Test: `desktop/tests/pythonBundleScript.test.mjs`

- [ ] **Step 1: Add CLI args**

Add optional `--platform` `--arch` to control output directory:
- default uses current host (linux/mac/win + x64/arm64)
- output: `python_dist/<platform>/<arch>/`

- [ ] **Step 2: Update electron-builder config**

Update `extraResources.from` to include `python_dist/<platform>/<arch>` resolved at build time (per runner).

---

### Task 5: electron-builder 多平台构建说明（非代码）

- [ ] **Step 1: Add docs**

Write `desktop/docs/packaging-matrix.md`:
- build commands per OS runner
- required env (no signing)
- artifact locations

---

### Task 6: Verification（当前 Linux 环境能跑的部分）

- [ ] **Step 1: Run tests**

Run:

```bash
cd /workspace/desktop
node --test
```

- [ ] **Step 2: Validate manifests**

Run:

```bash
cd /workspace/desktop
npm run manifest:validate
```

- [ ] **Step 3: Package linux x64**

Run:

```bash
cd /workspace/desktop
npm run package
```

Expected: AppImage built and contains `resources-manifest.linux.x64.json` and correct python_dist path.

---

## Self-review checklist

- Spec coverage: manifest 多文件、选择器、校验、python_dist 输出规范、打包文档均覆盖
- Placeholder scan: 无 TODO/TBD；每个 task 有具体文件路径与命令
- Type consistency: platform/arch 命名与 Node/Electron 使用一致（win/darwin/linux + x64/arm64）
