# CI 与发布门禁职责

原则：每个风险有明确的检查负责人；同一提交已通过的源码测试不在 Release 全量重跑。不同平台、不同运行边界和新生成的制品不是同一种证据，但并非每个边界都必须在 PR、main 和 Release 三个阶段重复执行。

## 必需 CI：5 个检查

| 检查 | 保留原因与职责 |
| --- | --- |
| `verify` | 类型、lint、实时生产依赖审计及审计/SBOM 策略用例、字体许可、Web Lite 产物一致性、核心逻辑、设置与歌词草稿持久化、本地化、安全/IPC、生命周期及关键模块覆盖率 |
| `render-boundary-regression` | Linux 生产构建、界面首次打开/恢复、减少动态效果语义、受控 AI 流下 React 渲染次数；不是安装器或真实外部 AI 服务验证 |
| `web-lite-smoke` | Chromium 编辑、导出格式/尺寸/溢出边界、无障碍 axe，以及延迟加载界面的失败恢复 |
| `web-lite-cross-browser-smoke` | 同一 job 运行 Firefox 和 WebKit 两个最小关键路径项目；共享依赖安装，不删浏览器、不复制 Chromium 完整套件 |
| `desktop-packaged-regression` | Windows 生产构建及 `win-unpacked`/ASAR 打包资源、单实例、来源边界、剪贴板、设置、历史/自动保存恢复；不再生成和安装 Setup |

PR 和最终 `main` push 都运行这些检查。合并可能改变提交 SHA，不能拿 PR 的旧结果替代最终提交。发布授权必须核验 `security/release-source-policy.json` 中全部检查成功；缺失、跳过或失败都阻塞发布。

## 2026-09-04 再次复核与删减

| 检查或执行方式 | 结论 | 精简后的负责人及代价 |
| --- | --- | --- |
| 同一 CI 内反复 `web-lite:check` | 删除 Chromium 和兼容性 job 中的重复执行，实际从 4 次减为 1 次 | `verify` 检查同 SHA 的已提交产物，浏览器直接测试该产物；全部五项仍须同时成功，不新增 job 之间的串行等待 |
| Firefox/WebKit 各占一个 runner | 合并为一个兼容性 job，必需状态从 6 项减为 5 项 | 两个项目均执行并保留各自结果；少一次 checkout、Node/npm 安装，代价是两个短测试串行执行，任一失败仍阻塞 |
| PR/main CI 生成、安装、卸载 Setup，以及安装包文件名检查 | 从普通 CI 删除 | CI 用已有 `desktop:pack` 构建真实打包应用并保留完整交互；Release 检查实际 Setup 字节。安装器专属错误会更晚到发布阶段才暴露，可按需本地提前执行 |
| Release 的审计策略固定用例 | 删除重复执行 | CI 的 `dependency-audit:gate` 已覆盖生产及 Electron 审计策略；Release 继续实时生产审计、重新提取打包依赖并实时审计，不复用旧审计结果 |
| 仅发布时运行的 `sbom:test` | 前移到必需 `verify`，Release 不重跑 | 固定恶意/兼容用例在合并前发现问题；新制品的 SBOM 生成与检查仍属于 Release |
| 背景合成每周性能跑批 | 删除定时触发 | 保留手动 workflow 和本地命令；不会再自动采集每周趋势 |
| 色场规划用例的 5 秒硬阈值 | 删除阻塞断言 | 继续输出耗时；几何、单元数量和合成质量仍有确定性断言，CI 不再以共享机器速度判断正确性 |

最近一次变更前的 [main CI #33851519800](https://github.com/Qrzzzz/lyrics-card-generator/actions/runs/33851519800) 中，Windows 完整交互约 6 分 42 秒，Setup smoke 约 49 秒，Firefox/WebKit 测试各约十几秒。依赖安装耗时更长，不能把删除用例数等同于端到端提速，也不承诺固定节省比例。

五个检查仍覆盖原来的六类功能边界：源码测试不能代替真实导出、浏览器不能代替 Windows IPC/持久化，Chromium 也不能代替已承诺支持的 Firefox/Safari。合并 runner 不等于删除项目。两组覆盖率只针对关键模块及 Electron 边界，不是全仓统一的覆盖率配额；其行为用例和低成本防漏价值仍保留。

渲染次数、资源字节数与几何上限属于确定性工作量/安全约束，不等于机器相关的毫秒性能阈值，不随本次性能门禁精简一并删除。

## v6.2.8 已完成的去重（本轮不重复计入）

- 删除独立 `security/locale/a11y gates` job：其中 `stability:test` 和 `coverage` 已由 `verify` 执行，`a11y:test` 是完整 Web Lite smoke 中的 axe 子集。必需状态同步从 7 项减为 6 项。
- 删除 `verify` 末尾独立 `build`：必需的 render-boundary job 已在同一 Linux 平台执行生产构建。
- `core:test` 不再重复单实例、偏好保存和远程历史存储测试，分别归属 `stability:test` 与 `electron-runtime:coverage`；核心套件仍保留历史会话和自动草稿测试。相关单项命令保留，便于局部开发。
- Release 不再重跑 `web-lite:check`、源码字体许可测试、独立 typecheck/lint、stability、两组覆盖率、core 和完整桌面交互套件。它们由经过授权的同一 SHA 的必需 CI 负责。
- Release 删除前置 `build`：`desktop:build` 自带类型检查、生产构建和打包，只构建一次。没有为节省时间关闭构建器自身的检查。
- Pages 不再在 `web-lite:check` 后重复 `web-lite:build`。check 已在临时目录重建并比较，随后部署通过检查的已提交产物。
- Toast 末尾标点从硬断言降为非阻塞文案建议：句号不应阻止发布；六语言缺键、空文案、未翻译与占位符不一致仍阻塞。

工作流合约测试既防止重复 job 回流，也检查被合并的测试仍有负责人，尤其保留自动保存的真实关闭/重启恢复验证。没有删除产品回归测试文件；功能、安全和数据完整性失败仍然阻塞。

## Release 仍必须现场执行

1. 标签、版本、多语言发布说明、最终 SHA、main 祖先关系、合并 PR 和同 SHA CI 授权。发布前再次核验，防止构建期间来源变化。
2. 实时生产依赖审计：漏洞公告和豁免期限会变化，旧 CI 不能代替当前检查。
3. 发布说明必须脱离候选措辞。审计及 SBOM 策略固定用例由同 SHA CI 负责；PowerShell 多命令块须在任一原生命令失败时终止，不能被后续成功命令掩盖。
4. 从授权 SHA 重新构建 Setup，验证打包资源与许可，安装实际 Setup、启动、关闭和卸载。此处验证的是新生成的发布字节，不能用 CI 的 unpacked 成功结果代替。
5. 对打包 Electron 依赖闭包审计；SBOM、校验和、来源证明、上传后的精确草稿制品校验，以及通过后发布。

完整 Windows 交互回归依赖同 SHA 的 CI 结果，最终安装包 smoke 只覆盖安装和启动等制品边界，不宣称等价于完整交互套件。反过来，普通 CI 的 unpacked 结果不再宣称覆盖安装器。若以后发布构建引入与 CI 不同的功能开关或运行配置，应补回相关交互验证。

## 不作为发布前提的检查

- 背景合成长卡性能基准：只保留手动执行，不在发布必需检查列表中。主动运行时，其自身失败仍应被报告。
- 桌面像素和帧耗时诊断：保留手动 opt-in、非阻塞。
- 实时音乐服务探测、README 媒体生成、启动性能、体积报告：按相关变更或排障需要执行，不要求每次 Release 全量运行。
- Pages 是独立静态站点部署流程，不是桌面 Release 的必需 CI 状态；仍在部署前验证自己的产物和分发白名单。

不新增路径跳过规则：共享组件、配置、依赖和文档合约存在交叉影响，且发布授权需要最终 SHA 的完整证据。保留 PR/main 双阶段，因为合并可能改变 SHA；保留发布前来源复核，因为它跨越构建、草稿写入和公开发布三个状态边界。Pages 有独立触发和部署权限，不能凭同时触发的 CI 推断已经验证，因此仍保留部署前自己的产物/许可检查。

没有降低浏览器支持范围、安全阈值、数据恢复要求或发布制品可信性；明确接受安装器错误发现时点后移及取消自动性能趋势采集。

## 维护与迁移

本地复核按改动边界选择用例，不再额外规定一份无条件全量本地 gate。工作流修改应验证 CI/Release 合约、发布授权用例及 PowerShell 语法/原生命令失败传播；打包路径修改应实际重建并测试受影响的产物。完整远端 CI 成功只能在推送后确认，不能把本地结果当作已通过远端发布授权。

`security/release-source-policy.json` 和授权 fixtures 已同步到五个状态名。旧的 `web-lite-cross-browser-smoke (firefox)` / `(webkit)` 结果不能代替新 job 的成功，合并改动后仍需最终 main SHA 的新 CI。若仓库另有分支保护，应把这两个旧状态替换为 `web-lite-cross-browser-smoke`，不要要求已经不再运行的名字。

复核时 main 的 branch protection API 返回未保护，适用分支 rules API 返回空列表，无远端规则需要同步；这是当时的只读快照，不保证之后仍相同。此文档和工作流不会自动修改 GitHub 保护规则，也不会授权提交、推送或发布。

## 本轮本地验证快照

- 通过：四个工作流 YAML、五个 CI 状态与发布策略精确对应、CI/Release 合约、来源授权用例（含旧状态名与失败/跳过拒绝）、13 段 PowerShell 语法及失败传播、10 个内存变异反向检查。
- 通过：`stability:test`、`core:test`、两组覆盖率、审计/SBOM 策略用例、Web Lite 一致性、字体许可、lint、类型检查及新的 `desktop:pack` 生产构建、打包资源和完整 Windows 交互回归。
- 通过：Chromium Web Lite 30 项（另有 1 个 opt-in 性能基准按设计跳过）、Firefox/WebKit 2 项、延迟界面恢复 7 项、基于本轮生产构建的渲染边界 3 项。
- 未通过：实时 `dependency-audit:check`。直接复核原始 `npm audit` 返回官方 `/-/npm/v1/security/advisories/bulk` 接口网络超时，不能判作漏洞清零或审计成功；未更改豁免或放宽阈值。
- 未执行：推送后的 GitHub/Linux CI、Setup 构建安装及远端 Release/Pages 发布。以上本地 Windows/Node 24 结果不冒充 GitHub 的 Node 22 或发布制品验收；没有提交或推送。
