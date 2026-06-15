<div align="center">

# 🎧 Lyrics Card Generator

### 生成高质感歌词分享卡片的 Windows 桌面应用

**Apple Music / 网易云音乐 / QQ 音乐 · 手动编辑 · 高清 PNG 导出 · 桌面版打包**

[English](./README.en.md) · [下载最新版](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest) · [v1.1.0 更新](#v110-更新重点) · [主要功能](#主要功能) · [本地开发](#本地开发) · [许可证](./LICENSE)

![Platform](https://img.shields.io/badge/Platform-Windows%20Desktop-111827)
![Version](https://img.shields.io/badge/Release-v1.1.0-2563EB)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%2B%20React%20%2B%20TypeScript-0F766E)
![Desktop](https://img.shields.io/badge/Desktop-Electron-1D4ED8)
![Output](https://img.shields.io/badge/Output-High--resolution%20PNG-FF5722)
![Docs](https://img.shields.io/badge/Docs-ZH%20%2F%20EN-7C3AED)

</div>

---

Lyrics Card Generator 用来把歌曲信息、歌词、翻译和封面整理成适合分享的歌词卡片。你可以粘贴音乐平台链接自动解析，也可以完全手动填写内容，然后调整画布、字体、颜色、边框、水印等样式，最后导出 PNG 图片。

当前主线是 Windows 桌面版：普通用户下载 EXE 后即可运行，不需要手动安装 Node.js，也不需要部署服务器。

<a id="v110-更新重点"></a>

## 🧹 v1.1.0 更新重点

v1.1.0 是一次以“瘦身”和“整理”为主的维护更新。核心功能基本保持不变，重点放在清理历史遗留代码、拆分编辑器结构、稳定桌面版导出与打包流程。

主要变化：

* 清理未使用代码和冗余逻辑，减少项目负担。
* 重构编辑器结构，将原本集中的界面与副作用逻辑拆分为独立组件和 hooks。
* 保留原有卡片布局算法，避免整理代码影响歌词卡片渲染效果。
* 修复桌面版导出面板和 PNG 导出控制项。
* 修复桌面版字体打包问题，确保内置字体能够正常加载。
* 整理 Windows 桌面版构建流程，明确安装版与便携版产物。
* 更新版本号、下载文件名和相关版本信息至 `1.1.0`。

这不是一个“大量新增功能”的版本。它更像是把项目从“能跑”整理到“更容易继续维护”。

## 📦 下载与安装

请前往 GitHub Releases 下载最新版：

* 安装版：`Lyrics Card Generator Setup 1.1.0.exe`
* 便携版：`Lyrics Card Generator-1.1.0-portable.exe`

安装版适合长期使用；便携版适合临时运行、测试或放在移动硬盘中使用。

> 当前版本未进行代码签名。Windows 可能显示 SmartScreen 提示，这是个人未签名应用的常见现象。

<a id="主要功能"></a>

## ✨ 主要功能

* 生成歌词分享图片，并导出高清 PNG。
* 支持竖版、横版和自定义画布尺寸。
* 支持自动卡片高度，长歌词、翻译和底部信息开启时会自动延展。
* 支持歌词原文与翻译排版。
* 支持 Apple Music、网易云音乐、QQ 音乐链接解析。
* 支持手动填写歌曲名、艺人、封面和歌词。
* 支持本地封面上传。
* 支持从封面提取色彩并生成渐变背景。
* 支持平台 Logo、分享人、生成水印。
* 支持边框、阴影、字体、字号、行距、文字颜色等视觉设置。
* 支持中文 / English 界面切换。
* 支持从 GitHub Releases 检查新版本。

## 🪟 Windows 桌面版说明

桌面版保留了原本的 Next.js Web 界面和 API 路由，并通过 Electron 包装为本地应用。

运行 EXE 后，应用会在本机启动一个本地 Next 服务，并在桌面窗口中打开它。普通用户只需要双击 EXE 使用，不需要了解 Node.js、npm 或本地开发环境。

桌面版可以离线启动。以下功能在离线状态下仍可使用：

* 手动编辑歌曲信息
* 手动编辑歌词和翻译
* 上传本地封面
* 调整样式
* 生成和导出 PNG 图片

以下功能需要联网：

* 音乐平台链接解析
* 远程封面加载
* 自动歌词获取
* GitHub 检查更新

## 🚀 使用方式

1. 启动应用。
2. 粘贴 Apple Music、网易云音乐或 QQ 音乐链接，或手动填写歌曲信息。
3. 编辑歌词和翻译。
4. 调整画布比例、字体、字号、颜色、边框、水印等样式。
5. 在右侧预览卡片。
6. 点击导出，保存 PNG 图片。

## 🔄 检查更新

应用内提供“检查更新”按钮。它会请求本项目的 GitHub Releases，比较当前版本和最新发布版本。

该功能只负责检查更新并打开下载页面，不会静默下载安装包，也不会自动替换当前程序。

<a id="本地开发"></a>

## 🛠️ 本地开发

需要 Node.js 和 npm。

```bash
npm install
npm run dev
```

启动后访问：

```text
http://localhost:3000
```

## 🖥️ 桌面版开发与打包

开发桌面版：

```bash
npm run desktop:dev
```

构建可检查的 unpacked 桌面目录：

```bash
npm run desktop:pack
```

构建 Windows 安装版和便携版：

```bash
npm run desktop:build
```

构建产物会输出到：

```text
release/
```

桌面版所需的 Next standalone 服务会被整理到：

```text
dist-desktop/server
```

## 📜 常用脚本

```bash
npm run dev             # 启动 Web 开发服务器
npm run build           # 构建 Next.js 应用
npm run typecheck       # TypeScript 类型检查
npm run desktop:dev     # 启动 Electron 开发模式
npm run desktop:pack    # 构建 unpacked 桌面目录
npm run desktop:build   # 构建 Windows 安装版和便携版
npm run parse:test      # 测试歌曲链接解析
```

## 🧩 技术栈

* [Next.js](https://nextjs.org/)
* [React](https://react.dev/)
* [TypeScript](https://www.typescriptlang.org/)
* [Tailwind CSS](https://tailwindcss.com/)
* [Electron](https://www.electronjs.org/)
* [electron-builder](https://www.electron.build/)
* [html-to-image](https://github.com/bubkoo/html-to-image)
* [Framer Motion](https://motion.dev/)
* [Lucide React](https://lucide.dev/)
* [Cheerio](https://cheerio.js.org/)
* [Zod](https://zod.dev/)
* [ReactBits](https://www.reactbits.dev/) 风格 UI 灵感

## 🔤 字体

项目使用：

* [思源黑体](https://github.com/adobe-fonts/source-han-sans)
* [思源宋体](https://github.com/adobe-fonts/source-han-serif)

它们为卡片提供了厚重、清晰、适合中文歌词排版的字体基础。

## 🙏 致谢

感谢 [Apple Music](https://music.apple.com/)。这个项目的彩色渐变、流光背景审美，以及早期歌词卡片排版方向，受到 Apple Music 视觉体验的启发。本项目与 Apple Music 没有关联，也不代表 Apple Music 官方立场。

感谢 [思源黑体](https://github.com/adobe-fonts/source-han-sans) 和 [思源宋体](https://github.com/adobe-fonts/source-han-serif)。它们为中文歌词卡片提供了稳定、清晰、有分量的字体基础。

感谢 [Sabrina Carpenter](https://www.sabrinacarpenter.com/) 的《opposite》。它作为应用启动时的默认样例，帮助确定了初版排版、英文歌词和中文翻译的视觉节奏。相关音乐作品权利归原权利人所有，本项目不分发音频内容。

感谢 [OpenAI Codex](https://openai.com/codex/)。它把许多零散想法转化为可运行的代码、桌面版构建流程和实际功能。

感谢 [ChatGPT 5.5](https://chatgpt.com/) 在开发过程中进行问题定位、方案设计、修复复核和验收检查。

感谢 [ReactBits](https://www.reactbits.dev/) 提供的多种 UI 创意，包括 Spark Cursor 等动效灵感。

感谢 Rangerov 对此项目的关注和提出意见。

感谢 [Sakuramble](https://github.com/Sakuramble) 对 [v1.1.0](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0) 文档呈现提出建议，尤其是更准确地区分维护更新与功能更新，并补充中英文说明和链接。

也感谢现代前端与桌面应用生态中的开源项目及其维护者。没有这些基础设施，这个项目不会以现在的形态出现。

## 📄 许可证

本项目采用自定义 Source Available License，而不是传统开源许可证。

你可以为了个人、非商业、学习、评估目的查看、下载、运行源码，并进行仅限个人使用的私下修改。未经作者书面许可，不得商用、再分发、重新打包、公开发布修改版，或基于本项目制作竞争性产品。

本项目依赖的第三方开源组件仍遵循它们各自的许可证。详见 [LICENSE](./LICENSE)。