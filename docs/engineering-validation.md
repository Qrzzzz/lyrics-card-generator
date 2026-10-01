# 工程校验与输出治理

[文档索引](./README.md)

6.5.9 对应 #204、#206–#212。修复以 6.5.8 为基线；本页描述维护契约，不代表已经发布或完成远端验收。

## 请求与输出

JSON 读取器只返回 `unknown`。AI HTTP 路由先校验对象、字段类型和长度、temperature 范围、reasoning 类型，再创建 provider 请求。已有缺失字段错误码保留；错类型统一返回 `400 invalid_request`。字节预算仍在读取阶段执行，超限返回 413。`request-boundary:test` 用真实 Request 验证负例且断言 provider 调用数为零。

图片代理将客户端 signal 传到 safeFetch，取消返回 499。`image-proxy:test` 覆盖预先取消、DNS、headers 和受控本地 socket 的 body 取消；本地 socket 仅是测试传输映射，产品 SSRF 策略不变。此证据不代表真实远端压力测试。

桌面与 Web Lite 使用 `lib/image-output-controller.ts` 统一快照、尺寸、互斥、超时、capture 和通知。平台仅适配 host readiness、封面资源租约和成功回调。桌面保留动态加载与清空后的庆祝抑制；Web Lite 保留本地封面租约，卸载时回收过期 URL。

## 测试与覆盖范围

`npm run desktop:scenario-test -- --scenario=search` 可单独运行 search、song-import、examples、fonts、titlebar。每个子进程重新启动应用并创建独立 userData，不继承其他场景的数据；不带参数依次运行五个隔离场景。`desktop:image-output-test` 另以独立 userData 检查真实 PNG/WebP/JPG 下载、解码格式、尺寸与快照卸载。原 `desktop:interaction-test` 连续流程作为过渡保留，像素和耗时诊断仍 opt-in。

请求 schema 的错类型/超长负例、导出 late-block/mount failure/timeout 和草稿恢复负例属于行为检查。AI 传输逻辑从 main 导出为 `electron/ai-translation.js`，重定向回归直接调用该服务，取消 AST/new Function 抽取。偏好写入使用 `electron/app-preferences-writer.js`，直接校验原子文件、修订号/时间戳、并发、保存失败、队列恢复和损坏文件恢复。源码接线断言仅证明接线，不能替代运行行为。轮询间隔和受控慢 provider fixture 是调度工具；判断完成须依赖可观测状态。

CI 的 `coverage` 只统计 `lib/settings/app-preferences-reconciliation.ts` 和 `lib/ai/error-copy.ts`。`electron-runtime:coverage` 只统计 package.json 中列出的 preload、IPC、URL、保存、历史、启动和 AI registry 模块，并按文件设置阈值。另有 `preferences-writer:coverage` 专门统计 `electron/app-preferences-writer.js`，门槛为语句/行/函数 90%、分支 80%；真实文件、并发、写入失败和重试注入覆盖其风险分支。这些都不是全仓覆盖率；schema 与恢复负例的证据单独报告。

## 缓存与资源预算

字体文件保持完整字库和许可证。`npm run fonts:version` 从全部 CSS 字体引用生成 SHA-256 内容版本；Web Lite 构建与缓存测试校验内容版本，字体变更必须先更新 URL。带 16 位内容版本的 Next 字体请求使用 immutable；无版本请求使用 must-revalidate。

`security/distribution-budgets.json` 定义带理由的预算，按字节检查，不依赖机器耗时。Web Lite build/check 检查 HTML、JS、CSS 与源资源；CI 检查 fonts/public/index.html；desktop:prepare 检查 app/server 暂存目录。首次基线约为 HTML 822 KB、三个 CJK 字体 58,863,976 bytes；HTML 预算 950 KB，字体目录 66 MB，public 76 MB。桌面 app/server/updater 上限分别 2 MB/145 MB/3 MB，未压缩 Windows 目录包基线 504,992,730 bytes、上限 550 MB；CI 与 Release 构建后检查目录包，用于限制重复资源及依赖闭包膨胀；安装器压缩大小与实际首屏字体网络加载仍由相应制品/浏览器验收记录，不能推断为每次下载完整字库。`web-lite:smoke` 中的字体网络场景另附启动与真实导出阶段的字体 URL/响应字节报告，不将静态资源总量冒充首屏网络量。

`output/resource-budgets/web-lite.json` 保存分项、esbuild metafile 和按大小排序的输入贡献；`distribution.json` 保存资源/桌面暂存测量。超过预算失败，新增大依赖或资源需要说明原因并审核预算变更，不能删除字库或许可来达标。

## 仓库与政策文档

`output/` 是统一可忽略报告根，不进入 Git、ESLint 和 TypeScript 产品输入。需要长期版本化的证据放入 docs 并主动检查后提交；`index.html` 仍是受版本控制的发布输入，必须通过 web-lite:check。

`npm run output:cleanup-candidates` 只列出 output 下候选及绝对路径，不删除文件。实际清理必须另行核对路径、备份/回收并保留原始验收证据和进程锁定文件。

依赖豁免以 `security/npm-audit-exceptions.json` 为权威。当前文档标记区由 `dependency-docs:test` 检查；新增和撤销豁免的负例都会阻止漂移。#150 和原到期日保留在历史段；实时安全状态须由 registry audit 判断。
