# AItezhongyanjing-2（OmniScraper 桌面版）产品与工程计划书

> 目标：把“已完成能力”沉淀为可复用的稳定交付链路，并规划下一阶段功能与工程化路线。  
> 读者：产品 / 研发 / 测试 / 运维 / 运营 / 新人。  
> 本计划书默认以 `main` 分支为唯一长期主线，Nightly 作为持续交付入口。

## 目录

- 1. 项目定位与目标
- 2. 当前已完成能力清单（现状盘点）
- 3. 交付与发布体系（现状 + 规范）
- 4. 下一步路线图总览（按优先级）
- 5. 分阶段实施计划（里程碑 + 验收标准）
- 6. 功能 Backlog（详单）
- 7. 技术 Backlog（详单）
- 8. 质量保障与测试策略
- 9. 风险清单与应对策略
- 10. 研发流程与仓库治理（强制执行项）
- 11. 指标与反馈闭环（如何判断做对了）
- 12. 附录：常用路径/命令/约定

## 1. 项目定位与目标

### 1.1 项目定位

- **面向用户**：提供一个“开箱即用”的桌面工具，用于多平台（dy/xhs/bili）任务执行、日志观测、报告生成与导出。
- **面向团队**：提供一个可持续发布的工程载体（Nightly + Stable Release），让功能迭代不再依赖手工打包。

### 1.2 近期目标（1-4 周）

- Nightly 每次 main 更新自动产出可安装包（Windows/macOS/Linux）
- 首次启动资源下载失败可自助排障（文档 + UI 提示 + 可重试）
- 一键卸载安全可控（清数据 + 引导卸载）

### 1.3 中期目标（1-3 个月）

- 完整“版本发布”流程：变更日志、版本号策略、回滚策略、灰度策略
- 更强的可观测性：崩溃/错误/关键路径耗时统计（不含敏感数据）
- 更完善的任务能力：模板、批量、队列、恢复、失败重试、导出增强

### 1.4 长期目标（3-6 个月）

- 多机分发与企业部署：镜像资源、离线包、内网 CDN、可控升级
- 更多平台与更丰富的分析/报告能力（可配置、可扩展）

## 2. 当前已完成能力清单（现状盘点）

### 2.1 桌面端基础能力

- 任务页：平台选择（dy/xhs/bili）、detail/search 模式、OCR/评论深度/LLM 参数
- 日志展示：WebSocket 日志流 + IPC fallback
- 报告预览：任务结束后自动切到报告页；支持导出 Markdown/PDF/JSON
- 历史页：历史任务列表、报告预览、可基于 `cli_args` 重新运行

### 2.2 资源体系（关键）

- 资源 manifest 选择链路：
  - `OMNI_MANIFEST_PATH` 强制覆盖
  - `resources-manifest.<platform>.<arch>.json` 精确匹配
  - fallback `resources-manifest.json`
- 资源校验与下载：
  - sha256 强校验
  - 支持代理 `HTTP_PROXY/HTTPS_PROXY/NO_PROXY`
  - 锁机制避免多实例同时下载
  - 错误映射为可读中文提示（网络/磁盘/校验/锁）
- 支持批量校验 manifest（避免上线后下载失败）

### 2.3 多平台打包与交付

- electron-builder 目标：
  - Windows：NSIS `Setup.exe`
  - macOS：`dmg`
  - Linux：`AppImage`
- Python backend bundle（PyInstaller）：
  - 输出 `python_dist/<platform>/<arch>/...`
  - 打包只取 `python_dist/selected/...`，保持 runtime 路径稳定

### 2.4 GitHub Actions 自动化交付（关键）

- main push：
  - 自动构建各平台安装包
  - 自动更新 `nightly` tag 并更新 `nightly` prerelease 附件
- tag `v*`：
  - 触发稳定 Release 产物上传
- 备注：Windows ARM64 目前需要 self-hosted runner（GitHub hosted 不支持）

### 2.5 一键卸载（安全优先）

- 设置页入口
- 二次确认（含输入 `UNINSTALL`）
- 自动清理：
  - `~/OmniScraperExports`
  - Electron `userData`
- 引导卸载（best-effort，不做强删应用本体）

### 2.6 文档体系

- 用户手册：安装、使用、数据目录、环境变量
- 报错修复手册：资源初始化、任务启动、导出、历史、卸载等常见问题

## 3. 交付与发布体系（现状 + 规范）

### 3.1 Nightly（持续交付）

- 面向：日常使用、内部测试、快速验证
- 规则：
  - `nightly` tag 永远指向 main 最新 commit
  - `nightly` prerelease 附件永远是最新构建

### 3.2 Stable（版本发布）

- 面向：对外发布、可控回滚、稳定渠道
- 规则（建议落地）：
  - 仅在满足“发布门禁”时打 `vX.Y.Z`
  - Release notes 必须包含：新增/修复/已知问题/回滚方式

### 3.3 发布门禁（建议强制）

- CI 必须通过：
  - `npx tsc -p tsconfig.json --noEmit`
  - `node --test`
- 关键用户路径 smoke（手工或 e2e）：
  - 首次启动资源初始化
  - detail/search 各跑一次
  - 导出 markdown/pdf/json

## 4. 下一步路线图总览（按优先级）

> 约定：P0 必做（稳定性/交付链路）、P1 强烈建议（体验/效率）、P2 增强（扩展/商业化）、P3 探索（可选）

- **P0 稳定性与交付强化**
  - main 分支保护（必须 PR + 必须 CI + 禁止 force push）
  - Nightly Release 文案与安全提示完善（macOS/Windows 未签名提示）
  - 资源缓存管理：提供“仅清理资源缓存”按钮
  - 关键错误信息结构化（为排障与反馈服务）
- **P1 体验与运维效率**
  - Windows 卸载器定位增强（registry best-effort）
  - 资源下载镜像/内网加速机制（支持自定义 manifest/镜像源）
  - Crash/异常收集（本地可导出诊断包，不上传敏感数据）
  - 任务模板与预设（常用参数一键切换）
- **P2 功能扩展**
  - 批量任务/队列/并发策略（含失败重试）
  - 报告增强：多语言、更多导出格式、报告模板
  - 插件化/模块化平台适配（新增平台成本下降）
- **P3 商业化与企业级**
  - 自动更新（auto-updater）与灰度
  - 离线安装包（含资源离线包）
  - 企业策略：权限/审计/合规提示

## 5. 分阶段实施计划（里程碑 + 验收标准）

### Milestone A（P0）：交付链路与安全门禁固化

**范围**
- main 分支保护策略落地
- Nightly/Stable 发布文案与约定落地
- 资源缓存清理入口

**验收**
- main 禁止直接 push（必须 PR）
- PR 必须通过 CI 才能合并
- 设置页存在：
  - “仅清理资源缓存”按钮（不清理 runs/exports）
  - “一键卸载”仍保留
- Nightly Release 页面有明确提示：
  - 未签名风险
  - macOS “仍要打开”路径

### Milestone B（P1）：排障与诊断能力增强

**范围**
- 诊断包导出：一键打包日志 + meta + 环境信息（脱敏）
- 错误码标准化：UI 看到的错误应能映射到排障手册章节

**验收**
- 用户可从设置页导出 `diagnostics.zip`（不含 token/key）
- troubleshooting 文档中每个高频错误都有“如何收集信息”的指引

### Milestone C（P1）：任务效率与复用

**范围**
- 任务模板/预设（按平台/模式）
- 最近一次任务快速复跑（不依赖历史页）

**验收**
- 任务页可一键选择预设并直接启动
- 可“复跑上一次任务”并在 UI 可见参数变化

### Milestone D（P2）：队列/批量与更强导出

**范围**
- 批量任务队列（串行或受控并发）
- 失败重试策略（带退避）
- 导出增强（例如 HTML、更多 PDF 选项）

**验收**
- 批量任务可见进度、可暂停/继续、失败可重试
- 导出格式增加且稳定

## 6. 功能 Backlog（详单）

### 6.1 设置与运维

- P0：仅清理资源缓存（`~/OmniScraperExports/resources` + `.ready` + `.download.lock`）
- P0：显示当前资源 manifest 路径与版本（帮助定位资源问题）
- P1：导出诊断包（脱敏）
- P1：一键打开数据目录 / 导出目录 / 日志目录
- P1：Windows 卸载器定位增强（registry best-effort）

### 6.2 任务系统

- P1：任务模板（默认参数集合）
- P1：任务输入校验提示更友好（比如 ID/limit 范围提示）
- P2：批量队列（从列表/文件导入多个 ID 或关键词）
- P2：失败重试（可配置次数/间隔）
- P2：任务中断恢复（最少保证 meta 状态正确）

### 6.3 报告与导出

- P1：导出成功后提供“打开文件夹”按钮
- P2：导出 HTML（便于分享）
- P2：报告模板系统（不同平台/不同模式不同模板）
- P2：报告元数据页（run 信息、参数、资源版本、耗时等）

### 6.4 多平台扩展

- P2：新增平台时的脚手架/模板（减少复制粘贴）
- P3：平台插件化（外部模块加载）

## 7. 技术 Backlog（详单）

### 7.1 CI/CD 与可重复构建

- P0：为 main 加保护（GitHub Settings 层面）
- P1：将关键 smoke 测试脚本化（最少一条 e2e）
- P1：构建产物命名规范化（包含 version/commit/arch）
- P2：缓存策略优化（node/electron-builder/python）

### 7.2 资源系统

- P0：资源缓存清理与重试策略文档化
- P1：支持镜像源（manifest 里可配置多 URL fallback）
- P2：离线资源包（zip/tar 可导入）

### 7.3 安全

- P0：确保不落盘 API key（现状已做到“仅本次任务”口径，后续要持续审计）
- P1：统一敏感字段脱敏（日志/诊断包）
- P2：最小权限原则审计（文件读写范围）

### 7.4 可观测性

- P1：错误/崩溃日志收集（本地存储 + 用户可导出）
- P2：关键链路耗时统计（资源下载/启动/任务执行）

## 8. 质量保障与测试策略

### 8.1 单元测试（已存在，继续扩展）

- manifest resolver / validator
- resource downloader / lock
- uninstall core
- process manager

### 8.2 回归清单（每次发布必测）

- 首次启动资源初始化（成功/失败路径）
- 三个平台（dy/xhs/bili）各跑一次（detail/search 至少各一次）
- 任务停止与重复启动
- 历史查看与重新运行
- 报告导出（markdown/pdf/json）
- 设置页：清资源 / 一键卸载（至少验证确认流程与错误提示）

## 9. 风险清单与应对策略

### 9.1 未签名导致的安装阻碍

- 风险：macOS/Windows 可能阻止运行或提示未知发布者
- 应对：
  - P0：文档与 Release 文案明确提示
  - P2：引入签名/公证（成本较高，需证书与流程）

### 9.2 资源下载源不稳定

- 风险：Playwright CDN、网络波动导致下载失败
- 应对：
  - P1：镜像源/内部 CDN
  - P1：可切换 manifest（`OMNI_MANIFEST_PATH` 已具备）

### 9.3 Submodule 冲突与版本不可控

- 风险：rebase/merge 冲突，难以回滚
- 应对：
  - 约束 submodule 更新频率与责任人
  - 将 submodule bump 独立提交与发布说明

## 10. 研发流程与仓库治理（强制执行项）

### 10.1 分支策略

- `main`：唯一长期分支
- 其他分支：必须 PR 合并，合并后删除

### 10.2 合并策略

- 默认 squash merge（保持主线清晰）
- 若历史污染/风险大：cherry-pick 精确合入（本次已验证有效）

### 10.3 Issue/PR 模板（建议补齐）

- Issue：复现步骤、平台、安装包版本、runId、日志片段、诊断包
- PR：变更范围、测试项、风险点、是否影响打包/资源

## 11. 指标与反馈闭环（如何判断做对了）

建议最少收集（可手工统计或后续自动化）：

- Nightly 下载量与失败反馈数
- 首次启动成功率（用户反馈维度）
- 资源初始化失败的 Top 3 原因
- 任务成功率（按平台/模式）
- 导出成功率与失败原因分布

## 12. 附录：常用路径/命令/约定

### 12.1 默认路径

- 数据根目录：`~/OmniScraperExports`
- runs：`~/OmniScraperExports/runs/<runId>/`
- exports：`~/OmniScraperExports/exports/`
- resources：`~/OmniScraperExports/resources/`

### 12.2 常用环境变量

- `OVERRIDE_RESULTS_ROOT`
- `OMNI_MANIFEST_PATH`
- `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`

### 12.3 常用命令（开发/CI）

```bash
cd desktop
npx tsc -p tsconfig.json --noEmit
node --test
npm run manifest:validate
npm run package
```

