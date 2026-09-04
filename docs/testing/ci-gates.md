# CI 与发布门禁职责

原则：每个风险有明确的检查负责人；同一提交已通过的源码测试不在 Release 全量重跑。不同平台、不同运行边界和新生成的制品不是同一种证据。

## 必需 CI：6 个检查

| 检查 | 保留原因与职责 |
| --- | --- |
| `verify` | 类型、lint、实时生产依赖审计、字体许可、Web Lite 产物一致性、核心逻辑、设置与歌词草稿持久化、本地化、安全/IPC、生命周期及关键模块覆盖率 |
| `render-boundary-regression` | Linux 生产构建及真实渲染/导出尺寸与内容边界；源码断言不能替代浏览器测量 |
| `web-lite-smoke` | Chromium 编辑、导出、无障碍 axe，以及延迟加载界面的失败恢复 |
| `web-lite-cross-browser-smoke (firefox)` | 已承诺支持的 Firefox 最小关键路径，非完整套件复制 |
| `web-lite-cross-browser-smoke (webkit)` | 已承诺支持的 Safari 引擎最小关键路径，非完整套件复制 |
| `desktop-packaged-regression` | Windows 构建、打包资源、单实例、来源边界、剪贴板、设置、历史/自动保存恢复、真实 Setup 安装运行与卸载 |

PR 和最终 `main` push 都运行这些检查。合并可能改变提交 SHA，不能拿 PR 的旧结果替代最终提交。发布授权必须核验 `security/release-source-policy.json` 中全部检查成功；缺失、跳过或失败都阻塞发布。

## 本次删除的重复执行

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
3. 发布说明必须脱离候选措辞；SBOM 策略测试。PowerShell 多命令块须在任一原生命令失败时终止，不能被后续成功命令掩盖。
4. 从授权 SHA 重新构建 Setup，验证打包资源与许可，安装实际 Setup、启动、关闭和卸载。此处验证的是新生成的发布字节，不是复用 CI 安装包的成功结果。
5. 对打包 Electron 依赖闭包审计；SBOM、校验和、来源证明、上传后的精确草稿制品校验，以及通过后发布。

完整 Windows 交互回归依赖同 SHA 的 CI 结果，最终安装包 smoke 只覆盖安装和启动等制品边界，不宣称等价于完整交互套件。若以后发布构建引入与 CI 不同的功能开关或运行配置，应补回相关交互验证。

## 不作为发布前提的检查

- 背景合成长卡性能基准：保留每周/手动执行，用于发现趋势，不在发布必需检查列表中。其自身失败仍应被报告。
- 桌面像素和帧耗时诊断：保留手动 opt-in、非阻塞。
- 实时音乐服务探测、README 媒体生成、启动性能、体积报告：按相关变更或排障需要执行，不要求每次 Release 全量运行。
- Pages 是独立静态站点部署流程，不是桌面 Release 的必需 CI 状态；仍在部署前验证自己的产物和分发白名单。

不新增路径跳过规则：共享组件、配置、依赖和文档合约存在交叉影响，且发布授权需要最终 SHA 的完整证据。本次只去重，不降低浏览器支持范围、安全阈值、数据恢复要求或制品可信性。

## 维护与迁移

本地复核至少运行 `stability:test`（包含 CI/Release 合约与 PowerShell 语法）、`core:test`、两组覆盖率和受影响的产物检查。完整远端 CI 成功只能在推送后确认，不能把本地结果当作已通过远端发布授权。

若远端分支保护曾要求旧的 `security/locale/a11y gates` 状态，管理员需同步移除该名字，保留其余 6 项。此文档和工作流不会自动修改 GitHub 保护规则，也不会授权提交、推送或发布。
