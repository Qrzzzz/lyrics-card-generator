# CI 与发布门禁职责

原则：每个风险有明确的检查负责人；同一提交已通过的源码测试不在 Release 全量重跑。不同平台、不同运行边界和新生成的制品不是同一种证据，但并非每个边界都必须在 PR、main 和 Release 三个阶段重复执行。

## 必需 CI：5 个检查

| 检查 | 职责 |
| --- | --- |
| `verify` | 类型、lint、实时生产依赖审计及审计/SBOM 策略用例、字体许可、Web Lite 产物一致性、核心逻辑、设置与歌词草稿持久化、本地化、安全/IPC、生命周期及关键模块覆盖率 |
| `render-boundary-regression` | Linux 生产构建、界面首次打开/恢复、减少动态效果语义、受控 AI 流下 React 渲染次数；不是安装器或真实外部 AI 服务验证 |
| `web-lite-smoke` | Chromium 编辑、导出格式/尺寸/溢出边界、无障碍 axe，以及延迟加载界面的失败恢复 |
| `web-lite-cross-browser-smoke` | 同一 job 运行 Firefox 和 WebKit 两个最小关键路径项目；共享依赖安装，不复制 Chromium 完整套件 |
| `desktop-packaged-regression` | Windows 生产构建及 `win-unpacked`/ASAR 打包资源、单实例、来源边界、剪贴板、设置、历史/自动保存恢复；普通 CI 不生成和安装 Setup |

PR 和最终 `main` push 都运行这些检查。合并可能改变提交 SHA，因此不能用 PR 的旧结果替代最终提交。发布授权必须核验 `security/release-source-policy.json` 中要求的全部检查成功；缺失、跳过或失败都阻塞发布。

这些检查覆盖不同运行边界：源码测试不能代替真实导出，浏览器不能代替 Windows IPC/持久化，Chromium 也不能代替已承诺支持的 Firefox/Safari。渲染次数、资源字节数与几何上限属于确定性工作量或安全约束，不等同于机器相关的毫秒性能阈值。

## 本轮优化候选（2026-10-26）

本节描述 `codex/release-optimization` 中待远端验收的实现，取代下文历史记录中的
“默认仍为串行”规划；合并前不会改变已发布工作流。正式发布前三轮的效果观察
仍未完成，不以本地通过或旧 canary 的成功宣称新的默认路径已经提速。

- PR/main 默认共享一次 unpacked 构建，四组分别在独立 runner 运行：editor
  （六个 scenario 与偏好设置）、workspace（工作区设置与编辑）、data（五项）、
  native（七项）。旧连续设置的 116 个直接断言及其 helper 断言均保留；独立
  workspace 通过 UI 补齐导出默认值、历史设置及 AI 地址/模型前置条件。
- 手动 `desktop_shared_groups=false` 可运行旧完整串行路径。正式回退需要恢复
  默认选择，保持聚合必需检查名及全部覆盖；不通过跳过组解除发布阻塞。
- 所有 job checkout 精确 PR head 或 main SHA，与 GitHub run 身份一致；包身份
  新增源码树与 Node/Electron/builder 版本，仍校验 lock、契约、摘要与全部资源。
- 只有成功 main push 生成 OIDC 来源证明。Release 仅接受授权最终 SHA、当前 CI
  attempt 和五项完整检查；旧 SHA、PR 产物或仅源码树相同均不复用。缺失/到期
  回退完整构建，来源/内容/工具链不符立即失败。NSIS 构建前后核对运行时资源，
  最终安装、更新、审计、SBOM、校验和、来源证明及公开附件验证保持完整。
- Electron 锁定闭包实时审计进入 verify 和 Release 构建前；最终打包闭包审计
  继续现场执行。发布等待采用分阶段间隔，候选变更通过显式 `PrepareCandidate`
  归档旧状态，不复用旧候选 CI 授权。详见[发布入口](../release-runbook.md)。

### 已完成的自然到期与恢复验证

原 run [40169247764](https://github.com/Qrzzzz/lyrics-card-generator/actions/runs/40169247764)
的原制品 `12589428199` 在记录的保留期限后 API 返回 404，未手动删除。
显式重跑 native（attempt 2，job `121626245361`）在下载、安装及执行前失败，
聚合也失败；不声称 API 返回过 `expired=true`。检查失败日志后显式重跑构建，
attempt 3 的三组和聚合全部成功，均消费新制品 `12657952596`、同一内容摘要
`07c19ee289a7d4134d2a7b8623bb9af97832f71e892aa33601bb2b48f447ed76`，
editor/data/native 覆盖为 7/5/7，逐组验证 2,483 个资源。
详见 [#247 证据](https://github.com/Qrzzzz/lyrics-card-generator/issues/247#issuecomment-6418692765)。
这是旧三组源码的到期恢复证据；新四组默认路径和 main 签名复用仍需独立远端
验收。#247 已由维护者以 `not planned` 关闭，保留这一决定；本轮新证据记录于
优化 PR。以下日期段落保留当时状态，不代表本候选已完成验收。

## Release 必须现场执行

1. 核验标签、版本、多语言发布说明、最终 SHA、main 祖先关系、合并 PR 和同 SHA CI 授权，防止构建期间来源变化。
2. 执行实时生产依赖审计；漏洞公告和豁免期限会变化，旧 CI 结果不能替代当前检查。
3. 确认发布说明已经脱离候选措辞。审计及 SBOM 策略固定用例由同 SHA CI 负责；PowerShell 多命令块须在任一原生命令失败时终止，不能被后续成功命令掩盖。
4. 从授权 SHA 生成新的 Setup：命中严格核验的同 SHA main 运行时则复用 unpacked，否则完整重建。验证打包资源与许可，安装实际 Setup、启动、关闭和卸载。此处验证的是新生成的发布字节，不能用 CI 的 unpacked 成功结果替代。
5. 审计打包 Electron 依赖闭包，并生成、检查 SBOM、校验和与来源证明；上传后核对精确草稿制品，通过后再公开发布。

完整 Windows 交互回归依赖同 SHA 的 CI 结果；最终安装包 smoke 只覆盖安装、启动等制品边界，不宣称等价于完整交互套件。反过来，普通 CI 的 unpacked 结果也不宣称覆盖安装器。若发布构建引入与 CI 不同的功能开关或运行配置，应补充相应交互验证。

## 不作为发布前提的检查

- 背景合成长卡性能基准：手动执行，不在发布必需检查列表中；主动运行时，其自身失败仍应报告。
- 桌面像素和帧耗时诊断：手动 opt-in、非阻塞。
- 实时音乐服务探测、README 媒体生成、启动性能和体积报告：按相关变更或排障需要执行，不要求每次 Release 全量运行。
- Pages 是独立静态站点部署流程，不是桌面 Release 的必需 CI 状态；仍须在部署前验证自己的产物和分发白名单。

## 维护规则

不新增按路径跳过必需 CI 的规则：共享组件、配置、依赖和文档合约存在交叉影响，且发布授权需要最终 SHA 的完整证据。保留 PR/main 双阶段，因为合并可能改变 SHA；保留发布前来源复核，因为它跨越构建、草稿写入和公开发布三个状态边界。

本地复核按改动边界选择用例，不额外规定一份无条件全量本地 gate。工作流修改应验证 CI/Release 合约、发布授权用例及 PowerShell 语法/原生命令失败传播；打包路径修改应实际重建并测试受影响的产物。完整远端 CI 成功只能在推送后确认，不能把本地结果当作远端发布授权。

## 桌面回归实施与观测

跟踪：[桌面分组、稳定性与失败重跑 #247](https://github.com/Qrzzzz/lyrics-card-generator/issues/247)。

本节承接已关闭的 [#208](https://github.com/Qrzzzz/lyrics-card-generator/issues/208)。
其代表性场景隔离、直接行为测试和覆盖率说明已交付；当前仍保留过渡连续
聚合入口。后续只跟踪分组调度、失败重跑成本与新增时序证据，不重开历史
Issue 或把已完成内容重新列为缺陷。操作规则继续使用
[发布手册](../release-runbook.md)，不另建一套发布流程。

2026-10-22 的 [v6.8.1 main CI](https://github.com/Qrzzzz/lyrics-card-generator/actions/runs/39765198774)
中，桌面依赖安装 37 秒、unpacked 构建 80 秒、串行交互回归 656 秒。
该单次观测说明优先调查交互串行路径；不据此宣称所有 runner 的性能或
不稳定率。端口故障见 [main CI](https://github.com/Qrzzzz/lyrics-card-generator/actions/runs/39760325223)，
剪贴板提示捕获失败及重跑见 [PR CI](https://github.com/Qrzzzz/lyrics-card-generator/actions/runs/39762518934)。
v6.8.1 已加入测试端口原子预占、有限释放等待和场景日志；其余偶发问题仍需
定位，不能将不同失败混成一种根因，也不能把一次重跑成功记为修复。

### 当前实现与试运行

1. `scripts/desktop-regression-groups.mjs` 已逐项映射旧入口：编辑组保留六个
   scenario 与完整设置回归，数据组保留 support/import-history/autosave/history-transfer/history-budget，
   原生组保留 single-instance/startup-origin/language/clipboard/ai-errors/updater/image-output。
   使用 `npm run desktop:group:editor`、`:data`、`:native` 独立执行；组内串行，
   每组临时根目录与现有 userData 隔离，进程生命周期沿用现有工具。桌面会话锁
   阻止本机并发分组，超时终止自己拥有的子进程；保留日志及逐场景退出状态。
2. `.github/workflows/ci.yml` 的手动 `desktop_shared_groups=true` 试运行路径已实现
   从当前精确 SHA 构建一次 unpacked 程序，
   由独立 Windows runner 消费并执行分组。上传下载需验证源 run、SHA、
   lockfile、平台/架构、运行配置和制品摘要；验证 exe/ASAR/资源内容与权限。
   默认 PR/main 保留旧串行路径，先测量远端传输开销和实际总时长，再决定是否推广。
   `.lcg.gz` 使用受限清单和流式提取，拒绝路径越界、重名、符号链接、错误配置、
   checkout、lockfile、run/attempt、平台/架构和逐文件摘要；由构建 job 输出摘要和
   artifact ID，消费者使用精确 ID，不能信任下载文件自行声明的身份。
3. 已保留必需检查名 `desktop-packaged-regression` 作为聚合授权结果；所有必需
   分组必须实际成功，构建失败、分组缺失、取消、跳过或失败都不能产生成功
   聚合结果。同步验证来源政策与工作流合约，保持其余四个必需检查不变。
4. 保留已修复的端口预占；继续统一测试公共工具中的端口预占、进程退出、焦点/选区与提示观测。用可观测
   状态和有限 deadline 判断完成，保留原始断言；诊断中记录场景、预期/实际
   状态、错误及必要的截图，避免输出凭证、歌词或真实用户配置。

单实例、剪贴板、焦点、下载和 OS 设置等全局资源测试不得在同一桌面会话
并发；并行单位是独立 runner。真实高对比度、DPI 和跨显示器验收继续单列，
不由分组、浏览器模拟或 CI 成功替代。Release 仍从授权 SHA 构建并验证新的
Setup 字节；本次制品共享只针对同一轮 CI 的 unpacked 程序。

### 验收与回退

- [ ] 分组清单能逐项对应原有测试，代表性分组独立执行通过，不丢失覆盖。
- [ ] 注入构建失败、分组缺失/跳过/取消/失败、错误 SHA/摘要或制品不可用时，
  聚合和发布授权均失败；旧 PR 制品不能替代最终 main 提交。
- [ ] 可显式只重跑失败分组；同一 SHA、同一构建制品与运行契约下成功分组无需
  重跑，聚合重新确认全部结果。制品过期或身份不符时，重建构建任务及全部消费组。
- [ ] 首次失败与重跑成功都保留证据；相同故障复现后回到根因定位，禁止无限
  重试、自动隔离必需测试或降低断言。已知偶发问题保留 Issue 直到有修复证据。
- [ ] 至少三次发布记录墙钟时长、排队/构建/传输/各组耗时、首次通过率与失败
  重跑时长，以端到端收益决定是否保留分组方案，不设机器相关毫秒硬门槛。
- [ ] 回退时恢复旧聚合执行路径，保持五个必需 check 名称与覆盖，不取消
  PR/main 双阶段，不削减安装、更新、校验和、SBOM、来源证明及公开前验证。


### 本地测量及尚缺证据（2026-10-22）

当前 6.8.2 unpacked 候选共 2,478 个文件，505,363,513 字节。受限流式包为
241,517,586 字节，本机打包 7,553ms、提取与校验 4,446ms；exe 和 ASAR 摘要
在往返后完全一致。证据：`output/v6.8.2-bundle-measurement.json`。该包明确标记
`local-uncommitted`，不是 CI 授权制品。这个测量不包含 GitHub 上传/下载或独立
Windows runner 启动，不能据此宣称分组端到端更快。

手动试运行由 build job 构建和上传一次，三个矩阵成员各占一个独立 Windows runner。
聚合读取每组最新有效 attempt 的成功结果，验证 SHA、源 run、构建摘要、测试契约
及完整条目；较旧成功不能掩盖较新失败。只重跑失败 job 时保留原成功组和构建输出，
若制品过期须重建并重跑全部消费组。`desktop-packaged-regression` 的结果依赖全部
必需执行路径；取消、跳过、缺失、失败或身份错误均阻止授权。其余四项必需检查、
PR/main 双阶段与 Release 最终 Setup 验证继续保留。

聚合阶段保存 `desktop-timings.json`，记录 source SHA、run/attempt、排队、构建、
上传/下载、各组步骤和首次通过状态；未完整的首次检查证据记为 unknown，统计采集
有超时且非阻塞，采集失败不改变功能门禁结果；不能用缺失统计宣称提速。当前 run
未结束时总墙钟时间留空，不能把观察
时刻当成最终完成时间。可在完成后设置 `GITHUB_REPOSITORY`、`GH_TOKEN`，运行
`node scripts/record-desktop-ci-timings.mjs --run-id=编号` 补录。至少三次正式发布的
观察、真实 GitHub 传输成本及手动 canary 的 Windows 消费结果尚未取得，因此不推广
默认路径，不勾完或关闭 #247。

剪贴板提示的观察器已补齐 added/removed mutation 节点和既有可访问通知，避免提示
在同一批 mutation 内出现并移除时，仅查最终 DOM 丢失证据。确定性反例测试通过，
故障时保留原生格式/空图状态、已知提示的时间/焦点/可见性与截图。这个反例证明了
旧观察器的一个盲点，尚不能证明旧 PR CI 偶发失败的唯一根因；保留原失败与 Issue。

本地补充复核（2026-10-23）：data 五项、native 七项通过；editor 六个独立场景通过，
完整设置入口因旧头部按钮断言失败后同步相邻契约，定向复验通过，保留首次组失败。
共享包重新提取后的真实 exe 也通过四个启动来源场景。以上仍是本机候选证据；
远端 canary、网络传输和三次发布观察继续待完成。

2026-10-23 补记：已在已发布 `207426d` 上执行真实共享 canary
[39904555367](https://github.com/Qrzzzz/lyrics-card-generator/actions/runs/39904555367)。
构建与上传通过，但 artifact-ids 下载默认多出制品名称子目录，三组在解包前 ENOENT；
聚合正确失败。候选修复 merge-multiple 配置并保留精确 ID／摘要核验，增加传输前置
失败上下文。运行包上传约 4s、各组下载 2–4s；场景没有运行，不能据此声称总体更快。
修复后的远端验收和至少三次发布观察继续待完成；详见 [v6.8.3 验收记录](../acceptance/v6.8.3.md)。

2026-10-23 更新：6.8.3 已完成修复后的共享 canary；6.8.4 在
[39931752549](https://github.com/Qrzzzz/lyrics-card-generator/actions/runs/39931752549)
完成受控 data 组失败及单组恢复。最终聚合采用 editor/native attempt 1 和 data
attempt 2，原 runtime ID 与摘要不变，原成功任务和步骤时间不变。真实到期恢复及
多次发布观察仍缺；不据此推广默认共享路径或宣称全链提速。

### Web Lite 超时诊断与制品恢复

6.8.4 PR CI `39931740231` 的首轮 Web Lite job 被 GitHub 明确标注超过 15 分钟。
Chromium 安装占 605 秒，随后测试因总时限取消；定向重跑的安装为 27 秒，主测试
350 秒、延迟加载测试 60 秒并通过。保留首轮取消，不把重跑通过写成根因修复。
原日志进一步显示，系统依赖的 apt 下载用 9 分 51 秒取得 24.9 MB（42.2 kB/s），
而浏览器下载在该阶段结束后才开始。已定位的主要耗时来自 runner 的系统依赖下载，
不据此归因为应用测试死锁，也不声称已修复软件源的吞吐波动。

6.8.5 将该 job 上限设为 25 分钟，安装／主测试／延迟加载测试分别受 12／10／3 分钟
限制。各阶段输出耗时与退出码，日志、主测试及延迟加载测试的失败截图／trace 均纳入
always 上传；显式 bash 保留 pipefail，日志管道不能吞掉失败。仍需远端观察安装耗时，
不通过减少用例、自动重跑或放宽断言来消除失败记录。

共享组新增下载前的只读制品可用性检查；到期、缺失、不可访问或源身份不符均阻断。
认证／权限／网络错误不被吞作等待。真实到期与本地模拟过期分别记录，不删除现有制品
来冒充自然到期。原制品失效后的新构建具有新身份，三个消费组都必须重新执行；单组
恢复仅适用于原构建仍有效的情况。

### v6.8.6 浏览器运行环境

Linux 浏览器 job 和手动 benchmark 使用 `security/ci-browser-runtime.json` 指定的
官方 Playwright Noble 镜像，固定版本及 OCI digest，锁文件和三个引擎版本必须
一致。每个 job 实际启动所需浏览器，版本／缺文件／依赖错误均阻断，不再每轮从
软件源下载系统依赖，不靠扩大预算、减少用例或自动重跑取得成功。

容器使用 `--user 1001` 与 GitHub runner 的 HOME 所有者一致。预检同时验证政策
UID、实际 UID 和 HOME 所有者，身份不一致在浏览器启动前失败。首候选曾因 root
使用 pwuser HOME 被 Firefox 拒绝；该原始失败保留，不通过改 HOME 或安全参数掩盖。

预检、主测试和延迟加载仍有有限时限。预检日志及 always 运行上下文与报告一起
上传，测试尚未生成报告时也保留 source SHA、run/attempt 和 runtime outcome。
镜像拉取或 runner 初始化失败仍查 Actions 原始日志，不宣称消除全部基础设施故障。

手动共享 canary 可指定 `desktop_runtime_retention_days=1`，默认七日。等待 API
确认实际自然到期后，显式重跑旧消费组确认拒绝授权，再以原 SHA 重新执行构建及
全部消费组验证恢复。不删除现用制品制造到期，不把本地改写 expires_at 当真实验收。
所有新证据确认前，默认 PR/main 继续旧桌面路径。
