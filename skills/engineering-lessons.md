# 本次开发经验与问题教训（重点复盘）

> 面向：研发 / 维护 / 产品运营 / 新人上手  
> 目标：沉淀“可复用的正确做法”，并把“踩过的坑”变成可执行的规范与检查清单。

## 目录

- 1. 背景与交付范围
- 2. 关键决策与为什么这么做（重点）
- 3. 主要问题与教训（重点）
- 4. 工程实践清单（可直接照做）
- 5. GitHub Actions / Release 交付经验
- 6. 资源与多平台打包经验
- 7. 安全与合规注意事项
- 8. 用户体验与支持体系（用户手册/报错手册）经验
- 9. 分支管理与仓库治理经验（重点）
- 10. 建议的后续改进（按优先级）

## 1. 背景与交付范围

本次围绕桌面端“可用性 + 可交付性”做了以下交付：

- 多平台资源管理：按 `platform/arch` 选择资源 manifest，并支持 `OMNI_MANIFEST_PATH` 强制覆盖
- Windows/macOS/Linux 安装包产出：基于 electron-builder（Windows `Setup.exe` / macOS `dmg` / Linux `AppImage`）
- GitHub Actions 自动构建：Nightly（固定 tag + prerelease）与版本 tag（`v*`）发布
- 一键卸载：设置页入口 + 二次确认 + 清理数据/缓存 + 引导系统卸载
- 文档体系：用户手册 + 报错修复手册
- 分支治理：审查并合并有效代码至 main，删除无用分支

## 2. 关键决策与为什么这么做（重点）

### 2.1 资源 manifest 按平台/架构拆分

**决策**
- 从单一 `resources-manifest.json` 演进为 `resources-manifest.<platform>.<arch>.json`（并保留 fallback）。

**原因**
- Playwright/Chromium 等资源对平台与架构高度敏感，错误的资源会导致启动失败或运行不稳定。
- 允许在不改业务代码的情况下更新资源 URL/SHA（运营与部署更友好）。

**落地要点**
- 顺序：`OMNI_MANIFEST_PATH` → `resources-manifest.<platform>.<arch>.json` → `resources-manifest.json`
- 校验：在 CI 中加入 manifest 批量校验，避免“URL 可用但 SHA 不对/目录穿越”等问题上线。

### 2.2 Nightly 固定 tag + prerelease，而不是“每次提交自动发版本”

**决策**
- push main 自动更新 `nightly` tag，并持续更新 `nightly` prerelease 附件。

**原因（重点）**
- “每次提交自动递增版本”会立刻引入版本策略争议（谁决定 major/minor/patch？怎么写变更日志？怎么回滚？）
- fixed nightly 入口对用户最省事：只要告诉用户去下载 Nightly，就永远是最新版
- 稳定版本仍通过 `v*` tag 产出，既满足可控发布，也保留稳定回滚点

### 2.3 一键卸载不做“强删应用本体”，而是“清数据 + 引导卸载”

**决策**
- 自动清理：`~/OmniScraperExports` + Electron `userData`
- 仅引导用户完成系统卸载（Windows 尝试启动卸载器；macOS 提示拖拽；Linux AppImage 提示删除文件）

**原因（重点）**
- 跨平台安装形态差异巨大且路径不可靠（AppImage、dmg 拖拽、Windows 安装目录变化）
- “强删应用本体”风险高：容易误删/权限问题/被杀软拦截/引发投诉
- 生产级策略应该是“不会误删”的安全优先

## 3. 主要问题与教训（重点）

### 3.1 远端分支/本地分支/提交历史混乱会直接拖慢交付

**现象**
- 出现多个历史分支（含大量“Clone and Extend Repository”提交），难以判断哪些是有效功能。
- 存在分支 `ci/product-ci-gating`，从 diff 看是大规模删除文件，风险极高。

**教训（重点）**
- 分支越多不等于越安全；无治理的分支会造成“误合并、误删除、无法回溯”的风险。
- 合并策略必须明确：主线必须干净，实验分支必须短生命周期。

**改进**
- 只保留 `main` 为长期分支，其他分支通过 PR 流转，合并后自动删除。
- 对 main 设置保护：必须通过 Actions、必须 PR、禁止 force push。

### 3.2 Submodule 是高风险点：合并/回滚容易触发冲突

**现象**
- 在尝试 rebase/merge 时遇到 submodule merge conflict（Git 对非 trivial 的 submodule 冲突支持有限）。

**教训（重点）**
- 如果 submodule 不是硬性需求，尽量避免；否则必须有明确的更新策略与锁定规则。
- 统一 submodule 更新入口：只允许少数维护者更新，并明确记录更新原因与目标 commit。

**改进**
- 对 submodule 引入独立变更规范：每次 bump 都要写变更说明（commit message + release note）。
- 避免在“功能分支”里顺便 bump submodule，减少冲突面。

### 3.3 “工具链在本机可用”不等于“CI/打包机可用”

**现象**
- GitHub CLI 在当前环境不可用（`gh: command not found`），导致“预期能查仓库信息”与“实际环境限制”不一致。

**教训**
- 文档/流程必须基于最小依赖假设；对外部工具（gh、brew、pip）要说明前置条件。
- CI 里要尽量显式安装依赖或不依赖额外工具。

**改进**
- 将“依赖 gh-cli”改为“基于 git + GitHub Actions 的最小实现”，减少外部依赖。

### 3.4 Windows ARM64 生态现实：关键依赖可能无官方包

**现象（重点）**
- Playwright/Chromium 对应 build（如 v1161）不存在可用的 `chromium-win-arm64.zip`，只能复用 win64 包并依赖系统兼容层。

**教训**
- 在设计“支持 win-arm64”之前，先验证三件事：浏览器内核、OCR/模型、python bundle 是否可在该架构上稳定运行。

**改进**
- 文档中明确“win-arm64 需要 self-hosted runner + 依赖兼容层”的现状，并把它作为已知限制而非 bug。

## 4. 工程实践清单（可直接照做）

### 4.1 提交与合并

- 任何可发布变更必须满足：
  - `npx tsc -p tsconfig.json --noEmit` 通过
  - `node --test` 通过
- 合并到 main 采用：
  - 优先 PR（可审查）
  - 若遇到历史分支污染，使用 cherry-pick 精确合入（避免拖入不相关历史）

### 4.2 资源与下载

- 所有资源必须有：
  - URL（可访问）
  - sha256（严格校验）
  - dest（相对路径，禁止目录穿越）
- 错误映射要面向用户（“网络不可达/磁盘不足/校验失败”），而不是直接抛 `http_403:...`

### 4.3 删除/卸载必须“默认安全”

- 删除前做“路径安全校验”（必须在 home 下，且不是根目录）
- 删除采用 `force: true`，但失败要明确提示原因
- 不在日志中输出敏感信息（尤其 token、API key、完整请求头）

## 5. GitHub Actions / Release 交付经验

### 5.1 两条发布线

- **Nightly**：push main 自动更新 `nightly` prerelease（永远最新）
- **Stable**：推 `v*` tag 生成正式 Release（可回滚）

### 5.2 常见坑

- macOS runner 版本：Intel/Apple Silicon 需要不同的 runner（例如 macos-13 vs macos-14）
- 代码签名/公证：未做签名时，macOS/Windows 可能出现安全提示（文档需明确）

## 6. 资源与多平台打包经验

### 6.1 输出目录与打包内容必须“可预测”

- python bundle 产物固定通过 `python_dist/selected` 提供给 electron-builder（避免平台目录混乱）
- manifest 文件打包需包含 `resources-manifest*.json`，否则运行时无法按平台选择

### 6.2 运行时选择逻辑要可测试

- manifest resolver、uninstall core 都做了单测
- 关键路径尽量拆成纯函数/纯逻辑模块，避免 Electron 依赖导致难测

## 7. 安全与合规注意事项

- 不要将 token、key、cookie 写入仓库或日志
- “卸载/删除”属于高风险功能：必须二次确认，且不可强删未知路径
- 对外发布要明确“本工具用途与合规边界”，减少误用风险（建议后续补充到用户手册）

## 8. 用户体验与支持体系（文档）经验

- 用户手册必须覆盖：
  - 安装方式（exe/dmg/AppImage）
  - 数据目录（用户最关心：文件在哪）
  - 常见流程（跑任务、看报告、导出）
- 报错修复手册必须覆盖：
  - 资源初始化失败的几类典型原因（网络/代理/校验/磁盘）
  - 任务启动失败（bad_config / already_running）
  - 导出失败（权限/磁盘/取消）

## 9. 分支管理与仓库治理经验（重点）

**结论**
- 长期只保留 main，其他分支必须短命并通过 PR 合并。

**建议的仓库规则**
- main 分支保护：
  - 必须 PR
  - 必须 Actions 通过
  - 禁止 force push
- 自动清理策略：
  - PR 合并后删除分支
  - 对长期无人维护分支按策略归档/删除

## 10. 建议的后续改进（按优先级）

### P0（强烈建议尽快做）

- 在 GitHub 设置中开启 main 分支保护（避免误推/误删）
- Nightly Release 说明补充“未签名风险提示”（macOS/Windows）

### P1（体验/稳定性）

- Windows 卸载器定位策略增强：从 registry 读取卸载项路径（依旧保持 best-effort，不强删）
- 在设置页增加“仅清理资源缓存”按钮（比一键卸载更常用）

### P2（工程化）

- 文档首页（仓库根目录）补充 “下载 Nightly → 安装 → 使用” 的最短路径
- 将 CI 增加最小烟测（例如 lint/tsc/test）作为 merge gate

