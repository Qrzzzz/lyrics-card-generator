<div align="center">

# 🎧 Lyrics Card Generator｜歌词卡片生成器

### Create polished lyric sharing cards from music links or manual input
### 从音乐链接或手动输入生成高质感歌词分享卡片

**Apple Music / 网易云音乐 / QQ 音乐 · 中文 / English UI · Windows Desktop · High-resolution PNG export**

[下载最新版 / Latest Release](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest) · [主要功能 / Features](#主要功能) · [本地开发 / Development](#本地开发) · [许可证 / License](./LICENSE)

![Platform](https://img.shields.io/badge/Platform-Windows%20Desktop-111827)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%2B%20React%20%2B%20TypeScript-0F766E)
![Desktop](https://img.shields.io/badge/Desktop-Electron-1D4ED8)
![Output](https://img.shields.io/badge/Output-High--resolution%20PNG-FF5722)
![UI](https://img.shields.io/badge/UI-ZH%20%2F%20EN-7C3AED)
![Release](https://img.shields.io/github/v/release/Qrzzzz/lyrics-card-generator?include_prereleases)

</div>

---

当前重点是 Windows 桌面版：下载 EXE 后即可运行，无需手动安装 Node.js，也无需部署到服务器。

## 下载与安装

请前往 GitHub Releases 下载最新版：

* 推荐普通用户下载安装版：`Lyrics Card Generator Setup 1.1.0.exe`
* 不想安装时可下载便携版：`Lyrics Card Generator-1.1.0-portable.exe`

安装版适合长期使用；便携版适合临时运行、测试或放在移动硬盘中使用。

> 当前版本未进行代码签名。Windows 可能显示 SmartScreen 提示，这是未签名个人应用常见现象。

## 主要功能

* 生成高质感歌词分享图片
* 支持竖版、横版和自定义画布尺寸
* 支持自动卡片高度，长歌词、翻译和底部信息开启时会自动延展
* 支持歌词原文与翻译并排排版
* 支持 Apple Music、网易云音乐、QQ 音乐链接解析
* 支持手动填写歌曲名、艺人、封面和歌词
* 支持本地封面上传
* 支持从封面提取色彩并生成渐变背景
* 支持平台 Logo、分享人、生成水印
* 支持边框、阴影、字体、字号、行距、文字颜色等视觉设置
* 支持中文 / English 界面切换
* 支持导出高清 PNG 图片
* 支持从 GitHub Releases 检查新版本

## Windows 桌面版说明

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

## 使用方式

1. 启动应用。
2. 粘贴 Apple Music、网易云音乐或 QQ 音乐链接，或手动填写歌曲信息。
3. 编辑歌词和翻译。
4. 调整画布比例、字体、字号、颜色、边框、水印等样式。
5. 在右侧预览卡片。
6. 点击导出，保存 PNG 图片。

## 检查更新

应用内提供“检查更新”按钮。
它会请求本项目的 GitHub Releases，比较当前版本和最新发布版本。

该功能只负责检查更新并打开下载页面，不会静默下载安装包，也不会自动替换当前程序。

## 本地开发

需要 Node.js 和 npm。

```bash
npm install
npm run dev
```

启动后访问：

```text
http://localhost:3000
```

## 桌面版开发与打包

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

## 常用脚本

```bash
npm run dev             # 启动 Web 开发服务器
npm run build           # 构建 Next.js 应用
npm run typecheck       # TypeScript 类型检查
npm run desktop:dev     # 启动 Electron 开发模式
npm run desktop:pack    # 构建 unpacked 桌面目录
npm run desktop:build   # 构建 Windows 安装版和便携版
npm run parse:test      # 测试歌曲链接解析
```

## 技术栈

* Next.js
* React
* TypeScript
* Tailwind CSS
* Electron
* electron-builder
* html-to-image
* Framer Motion
* Lucide React
* Cheerio
* Zod
* ReactBits 风格 UI 灵感

## 字体

项目使用：

* 思源黑体
* 思源宋体

它们为卡片提供了厚重、清晰、适合中文歌词排版的字体基础。

## 致谢

感谢 Apple Music。这个项目的彩色渐变、流光背景审美，以及早期歌词卡片排版方向，受到 Apple Music 视觉体验的启发。本项目与 Apple Music 没有关联，也不代表 Apple Music 官方立场。

感谢思源黑体和思源宋体。它们为中文歌词卡片提供了稳定、清晰、有分量的字体基础。

感谢 Sabrina Carpenter 的《opposite》。它作为应用启动时的默认样例，帮助确定了初版排版、英文歌词和中文翻译的视觉节奏。相关音乐作品权利归原权利人所有，本项目不分发音频内容。

感谢 OpenAI Codex。它把许多零散想法转化为可运行的代码、桌面版构建流程和实际功能。

感谢 ChatGPT 5.5 在开发过程中进行问题定位、方案设计、修复复核和验收检查。

感谢 ReactBits 提供的多种 UI 创意，包括 Spark Cursor 等动效灵感。

感谢 Rangerov 对此项目的关注和提出意见。

也感谢这些开源项目及其维护者：Next.js、React、TypeScript、Tailwind CSS、Electron、electron-builder、html-to-image、Framer Motion、Lucide React、Cheerio、Zod，以及构成现代前端生态的众多工具链。没有这些基础设施，这个项目不会以现在的形态出现。

## 许可证

本项目采用自定义 Source Available License，而不是传统开源许可证。

你可以为了个人、非商业、学习、评估目的查看、下载、运行源码，并进行仅限个人使用的私下修改。未经作者书面许可，不得商用、再分发、重新打包、公开发布修改版，或基于本项目制作竞争性产品。

本项目依赖的第三方开源组件仍遵循它们各自的许可证。详见 [LICENSE](./LICENSE)。