# 开发指南

[English](./development.en.md) · [文档索引](./README.md) · [桌面版维护](./desktop.md)

本文是 Lyrics Card Generator 的简体中文开发入口，适用于简体中文与繁体中文 README。命令以仓库根目录为工作目录；`package.json` 是脚本名称的最终依据。

## 环境要求

- Git。
- Node.js 22（与 CI 和发布工作流一致），以及随 Node.js 安装的 npm。
- Windows 10/11 x64：构建和验证 Windows 桌面制品时必需。Web 与大多数纯 Node.js 测试也可在其他系统运行，但不代表桌面制品已通过验证。
- 运行浏览器测试时，需要安装 Playwright 对应的 Chromium、Firefox 或 WebKit。

项目不依赖仓库级 `.env` 文件。AI 服务的 Base URL、模型与 API Key 由应用设置管理，请勿将真实密钥写入源码、测试夹具、日志或提交内容。

## 获取代码与安装依赖

```bash
git clone https://github.com/Qrzzzz/lyrics-card-generator.git
cd lyrics-card-generator
npm ci
```

在已有工作区主动调整依赖时可使用 `npm install`；普通拉取、CI 复现和干净验证优先使用 `npm ci`，以严格遵循 `package-lock.json`。

浏览器测试首次运行前按需安装运行时：

```bash
npx playwright install chromium firefox webkit
```

## 启动开发环境

### Next.js Web 界面

```bash
npm run dev
```

默认访问 `http://localhost:3000`。如果 `.next` 缓存疑似损坏，可运行：

```bash
npm run dev:clean
```

这套 Web 开发界面包含 Next.js API 路由，不等同于静态 Web Lite。受支持的 `npm run dev` 会把 mutation 门禁固定到 `http://localhost:3000`；不要把该开发服务器暴露为生产部署。

### Electron 桌面界面

```bash
npm run desktop:dev
```

启动器会为当前工作区分配一个可用的 `127.0.0.1` 端口，同时启动 Next.js 与 Electron，并在桌面窗口退出时清理子进程。不要另行硬编码开发端口。

### Canonical origin 与反向代理

任何提供 mutation API 的运行时都必须确定唯一的浏览器 canonical origin。受支持的浏览器开发与 Electron 启动器会自动注入该值。production standalone 在执行 `npm run start` 前必须把 `LYRICS_CARD_APP_ORIGIN` 设为精确的 HTTP(S) origin；若缺失，mutation routes 会 fail-closed，并返回 HTTP 503 与 `app_origin_configuration_error`。

Canonical 值只能包含协议、主机与必要的非默认端口：应写作 `https://lyrics.example.com`，不能带末尾斜杠、路径、凭据、显式 `:443` 或非规范 IP 写法。直接部署时不设置 `LYRICS_CARD_TRUST_PROXY`，或将其设为 `0`。客户端提交的 `Host`、`X-Forwarded-Host` 与 `X-Forwarded-Proto` 永远不能决定 canonical origin。

只有反向代理是后端唯一入口时，才能设置 `LYRICS_CARD_TRUST_PROXY=1`。代理必须覆盖而不是追加 `X-Forwarded-Host` 与 `X-Forwarded-Proto`，且每个头只传一个 canonical 值。转交的协议与主机必须精确还原预先配置的 `LYRICS_CARD_APP_ORIGIN`；缺失、多值、替代写法或不匹配都会被拒绝。若 Next 后端仍可被直接访问，不得启用此模式。

代理终止 TLS 的 production 部署 PowerShell 示例：

```powershell
npm run build
$env:LYRICS_CARD_APP_ORIGIN = "https://lyrics.example.com"
$env:LYRICS_CARD_TRUST_PROXY = "1"
npm run start
```

这两个变量只控制应用 mutation origin。AI provider Base URL 策略保持独立，仍在应用设置中配置。

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| `app/` | Next.js 页面、布局与本地 API 路由 |
| `components/` | 编辑器、预览、设置与共享 React 组件 |
| `lib/` | 文档事务、解析器、导出、安全请求、布局与样式核心逻辑 |
| `electron/` | Electron 主进程、预加载、IPC、安全边界与桌面持久化 |
| `web-lite/` | 静态 Web Lite 入口及浏览器专用适配层 |
| `scripts/` | 构建、回归、审计、制品检查与维护脚本 |
| `tests/` | Playwright 浏览器测试与测试资源 |
| `public/` | 应用图标、字体及许可等运行时静态资源 |
| `docs/` | 开发、维护、安全、测试和发布说明 |
| `index.html` | 由 `web-lite:build` 生成并提交的 Web Lite 成品；不要手工编辑 |

## 日常验证

按改动范围选择最小但完整的验证集合：

```bash
npm run typecheck
npm run lint
npm run core:test
npm run build
```

- 只改 Markdown：至少检查链接、标题结构与 `git diff --check`。
- 改解析、事务、导出或安全边界：运行对应单项测试，并补跑 `core:test`。
- 改 Electron：补跑 `stability:test`、`electron-runtime:coverage` 或相关桌面交互测试。
- 改 Web Lite 或共享 UI：先重建 `index.html`，再运行 `web-lite:check` 与浏览器 smoke。
- 改可访问性或响应式界面：运行 `a11y:test` 及相关 Playwright 套件。

CI 的主要静态与 Node.js 门禁为：

```bash
npm run dependency-audit:gate
npm run sbom:test
npm run web-lite:check
npm run font-license:test
npm run typecheck
npm run lint
npm run stability:test
npm run coverage
npm run electron-runtime:coverage
npm run core:test
```

Linux 生产构建由必需的渲染边界 job 执行；浏览器与 Windows 桌面构建也在独立 job 中执行。不要把一次本地 `build` 通过描述为完整 CI 通过。门禁分工、去重与发布阶段复用规则见 [CI 与发布门禁](./testing/ci-gates.md)。

## Web Lite

Web Lite 是由 `web-lite/` 与共享组件构建的静态单页，应用样式和脚本内联到根目录 `index.html`，字体与图标保留为受控的 `public/` 资源。它没有 Next.js 服务器或 `/api/` 运行时。

```bash
npm run web-lite:build   # 重建并写入 index.html
npm run web-lite:check   # 在临时目录重建并与已提交成品比较，不修改工作区
npm run pages:prepare    # 生成 _site/ 的 Pages 白名单目录
npm run web-lite:smoke
npm run web-lite:cross-browser-smoke
```

改动共享 UI、样式、字体、版本展示或 Web Lite 适配层后，应运行 `web-lite:build` 并提交更新后的 `index.html`。浏览器支持范围见 [Web Lite 浏览器支持](./web-lite-browser-support.md)。

## Windows 桌面构建

```bash
npm run desktop:pack
```

该命令依次执行类型检查、Next.js 构建、桌面分发目录整理，并由 electron-builder 生成可检查的 `release/win-unpacked/`。

```bash
npm run desktop:build
```

该命令只生成 Windows x64 NSIS Setup：`release/Lyrics.Card.Generator.Setup.<version>.exe`。从 v6.2.2 起不再生成免安装版本。中间目录包括：

- `.next/standalone/`：Next.js standalone 原始输出。
- `dist-desktop/server/`：清理后的随包本地服务。
- `dist-desktop/app/`：最小 Electron 应用与打包清单。
- `release/`：最终或可检查的 Windows 制品。

`dist-desktop/` 与 `release/` 均为生成目录，不应作为源文件手工修改。架构、运行边界与制品验收见 [桌面版维护指南](./desktop.md)。

## 常用脚本

### 构建与静态检查

| 命令 | 用途 |
| --- | --- |
| `npm run clean:next` | 清理 `.next` 缓存 |
| `npm run dev` / `dev:clean` | 启动 Web 开发服务器，或清理后启动 |
| `npm run build` / `start` | 构建并启动生产模式 Next.js |
| `npm run typecheck` | 检查 Web 与 Electron TypeScript |
| `npm run electron:typecheck` | 仅检查 Electron TypeScript 配置 |
| `npm run lint` | 以零 warning 运行 ESLint |

### 核心、安全与稳定性

| 命令 | 用途 |
| --- | --- |
| `npm run core:test` | 运行主要纯函数、布局、字体、设置、解析与 UI 合约回归 |
| `npm run p0:test` | 运行安全请求、API 边界、事务与导出 P0 门禁 |
| `npm run stability:test` | 运行设置、生命周期、本地化、Electron 静态与工作流回归 |
| `npm run coverage` | 检查关键模块覆盖率阈值 |
| `npm run electron-runtime:coverage` | 检查 Electron 风险边界的逐文件覆盖率 |
| `npm run security:test` | 测试 Safe Fetch 与网络安全边界 |
| `npm run request-boundary:test` | 测试应用 API 请求来源与格式边界 |
| `npm run transactions:test` | 测试文档、AI 翻译与桌面取消事务 |
| `npm run export:test` / `export-readiness:test` | 测试不可变导出事务与导出门禁 |
| `npm run parse:test` | 测试多平台歌曲链接解析 |
| `npm run music-search:normalize-test` | 测试网易云搜索结果标准化 |
| `npm run music-search:test` | 运行依赖真实网络的网易云搜索测试；不作为离线确定性门禁 |

### 视觉、浏览器与性能

| 命令 | 用途 |
| --- | --- |
| `npm run palette:test` | 测试封面调色板提取 |
| `npm run color-field:test` | 测试空间色场 |
| `npm run background-composition:test` | 运行确定性背景构图矩阵 |
| `npm run background-composition:benchmark` | 运行大画布浏览器基准并输出诊断 |
| `npm run render-boundaries:test` | 构建并运行生产渲染边界回归 |
| `npm run deferred-surfaces:test` | 测试延迟加载界面的失败恢复 |
| `npm run a11y:test` | 运行 axe 可访问性门禁 |
| `npm run click-spark:test` | 测试 Click Spark 动效边界 |

### 桌面、资源与发布辅助

| 命令 | 用途 |
| --- | --- |
| `npm run desktop:interaction-test` | 运行已打包桌面的单实例、启动来源、设置与导入历史回归 |
| `npm run desktop:final-artifact-smoke` | 对最终 Setup 字节执行安装、启动、验证、关闭与卸载，并拒绝额外 EXE |
| `npm run desktop:packaged-assets-test` | 验证已打包静态资源与运行时清单 |
| `npm run desktop:startup-test` / `desktop:startup-benchmark` | 测试或测量打包服务启动 |
| `npm run desktop:size` | 审计桌面制品体积 |
| `npm run examples:generate-palettes` | 从开发期临时封面重新生成示例配色 |
| `npm run readme:media` / `readme:media:check` | 生成或检查 README 截图与示例卡 |
| `npm run font-license:test` | 验证字体文件与许可分发契约 |
| `npm run dependency-audit:gate` | 执行生产依赖漏洞策略门禁 |
| `npm run sbom:prepare` / `sbom:inspect -- <file>` | 准备并检查发布 SBOM 运行时视图 |

不常用的诊断和单项回归也保留在 `package.json` 中；调用前应先阅读对应 `scripts/` 文件，确认是否需要打包产物、浏览器、网络或额外参数。

## 提交与 PR 检查清单

1. 保持改动范围单一，不顺带修改版本号或发布说明。
2. 运行与改动范围匹配的验证，并记录未运行的高成本或平台专属门禁。
3. 若共享代码影响 Web Lite，重建并提交 `index.html`。
4. 检查 `git diff --check`、文档链接、生成文件和敏感信息。
5. PR 正文说明改动、验证结果及尚需 CI/Windows 执行的项目。
