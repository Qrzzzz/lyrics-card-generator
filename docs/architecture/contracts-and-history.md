# 共享契约、领域边界与历史存储预算

适用于 v6.5.10，对应 Issues [#213](https://github.com/Qrzzzz/lyrics-card-generator/issues/213)、[#214](https://github.com/Qrzzzz/lyrics-card-generator/issues/214)、[#215](https://github.com/Qrzzzz/lyrics-card-generator/issues/215)。

## 共享契约与兼容入口

`shared/` 只包含平台无关的规则、类型与预算。Next、renderer 与 Web Lite 不再从 `electron/` 导入共享领域逻辑。Electron 使用同一实现，旧 CommonJS 入口和声明保留转发兼容；旧 JSON 路径通过生成器同步，不能独立编辑。

- `card-style-schema.json` 定义所有可保存的样式字段、枚举、嵌套对象、旧草稿必需字段和验证约束。`contracts:generate` 生成 TS 类型，`contracts:check` 检查新鲜度。`CardStyle` 和公开枚举类型来自生成结果；草稿读取器使用同一 schema。
- schema 1 的旧草稿允许缺失非必需样式字段，renderer 用现有默认值补齐。缓存、测量结果和翻译派生字段不进入样式持久化。现有草稿版本 1、历史 JSON schema 1→2 迁移及内容往返保持兼容。
- `ai-settings.js`、`ai-prompt-settings.js` 集中默认值、隐藏预设、去重、区域提示词迁移和设置规范化；TS 与主进程读取同一实现。
- `ai-request-contract.js` 将 IPC 的 unknown 输入变成经验证的提示词和推理开关，错误类型或超长内容在凭据读取、provider 请求之前退出。
- sandbox preload 不能加载本地 CommonJS 模块。其内联剪贴板预算由共享 JSON 生成，生成检查会检测漂移；没有放宽沙箱限制。

`tsconfig.contracts.json` 对上述校验模块及历史预算模块启用 strict/checkJs，接入 `npm run typecheck`。其余 Electron 模块继续保留现有 checkJs 基线，逐模块扩展严格检查，不使用全局 ts-ignore。`contracts:test` 对每个样式字段、旧数据、往返与设置规范化进行行为验证。

## 领域输入、失败与取消

| 领域 | 输入与输出 | 失败与取消责任 |
| --- | --- | --- |
| `useEditorActions` | 原有公开动作接口；组合文档命令和图片输出 | 仅负责组装端口，保持现有调用方兼容 |
| `useEditorDocumentCommands` / `EditorDocumentStateAdapter` | 文档 mutation、import intent、revision、AI 翻译值 | 新编辑、替换、外部 abort、卸载共同撤销旧 intent；派生文本通过已有文档 adapter 同步 |
| `useEditorImageOutput` / `runImageOutputController` | 不可变导出快照、格式、校验与 capture adapter | mutex、挂载、取消、释放和清空后的完成状态归输出域 |
| renderer `history-gateway` | 保存的回放内容、intent 和显式文档/草稿端口 | 文件读取与网络请求使用同一 signal；回放成功后才提交元数据；草稿激活失败保持待保存状态 |
| Electron `history-replay` | 已验证记录和 sender-bound 文件能力 | 不接受 renderer 任意路径；本地音频使用有界文件流；缺失文件返回可重新定位结果 |
| `app-preferences-service` | 设置读、写、flush | 排序和原子写属于 writer；读取失败保留已验证值，避免意外重置历史保留数量；历史裁剪事务仍由原有队列负责 |
| `ai-service` | 设置 IPC、凭据动作、连接测试、翻译请求 | 凭据留在主进程安全存储；sender/request generation 负责取消和过期片段抑制；关闭等待 store.flush |

文档命令与 AI hook 共享由 composition root 创建的 `EditorAILifecycle`。它直接拥有 orchestrator；hook 间不再通过双向可变 ref 安装回调。所有 IPC channel 名称和关闭保存顺序保持兼容。

## ADR：继续使用旧 JSON 格式并设置明确预算

**决定：**本版保留历史 JSON schema 2，不引入分文件、journal 或 SQLite，也不自动淘汰长期草稿。单个主文件或恢复副本上限为 **64 MiB**，唯一配置是 `shared/resource-budgets.json` 的 `history.documentBytes`。

预算限制的是 JSON 文件而非草稿数量或封面文件；JSON 解码、规范化和快照会放大内存使用。64 MiB 给普通历史足够空间，同时为首次加载内存与整文件写入设定有限上界。封面仍使用原有独立内容寻址文件和预算。

读取通过同一打开句柄执行 stat 与有界分块读取，能发现 stat 后文件增长，超限不进行 JSON.parse、空文档恢复或自动迁移。写入先计算主文件序列化字节，检查恢复副本预算，再修改任何文件。拒绝操作返回 `history_storage_limit`；原文件、备份和封面引用保持可恢复。读取超限不是损坏，不能沿用 corrupt recovery 分支。

保存超限而历史仍可打开时，可先备份，再由用户删除不需要的草稿并重试；历史已无法加载时，须先保留主文件和 `.bak`，由维护者协助离线恢复。界面提供六语言说明，保存超限时通知可直接打开历史。5/10 条自动导入限制继续豁免草稿和旧手动存档。

删除检测用下一份记录 ID 的 Set 加一次旧记录扫描，最坏访问数不超过前后记录总数。同一语义 key 的预览更新在 clone 之前退出，不重新调度写入；强制保存和关闭 flush 继续使用原有 generation/重试逻辑。

**权衡：**每次有效保存仍需要重写主文件和恢复副本，本版不声称获得增量存储。`history-scale` 测试生成 `output/history-scale/results.json`，报告 10/100/1000 草稿的读取、序列化、主文件/备份写入字节、响应时间与确定性访问计数，不用机器相关毫秒数设门槛。

如以后工作负载要求增量存储，应另立迁移设计：备份、导入验证、中断恢复、降级导出和真实数据演练。此次决定没有实施新格式迁移，也没有改变旧版本的数据读取协议。

## 验证入口

`typecheck`、`lint`、`contracts:test`、`autosave:test`、`core:test`、`electron-runtime:coverage`、`deferred-surfaces:test`；Next build、Web Lite build/check；新打包应用的 sandbox preload、自动草稿与历史回放交互。

本地或 fixture 结果不等同于远端 CI、真实 AI provider、安装/卸载、SBOM、签名或公开 Release。正式发布仍由 `scripts/release.ps1` 和发布工作流负责。
