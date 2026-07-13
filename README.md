<div align="center">

# 🎧 Lyrics Card Generator

### 生成可用于分享的高质感歌词分享卡片

**Spotify / Apple Music / 网易云音乐 / QQ 音乐 · Windows 桌面应用 · 高清 PNG 导出 · 多语言文档**

<p>
  <strong>语言</strong><br/>
  <strong>简体中文</strong> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.en.md">English</a> ·
  <a href="./README.fr.md">Français</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <a href="./README.es.md">Español</a>
</p>

<p>
  <strong>导航</strong><br/>
  <a href="https://github.com/Qrzzzz/lyrics-card-generator/releases/latest">下载最新版</a> ·
  <a href="./docs/releases/v5.2.3.zh-CN.md">发布说明</a> ·
  <a href="https://qrzzzz.github.io/lyrics-card-generator/">在线 Web Lite 版</a> ·
  <a href="./docs/desktop.md">桌面维护文档</a> ·
  <a href="#主要功能">主要功能</a> ·
  <a href="#本地开发">本地开发</a> ·
  <a href="./LICENSE">许可证</a>
</p>

![Platform](https://img.shields.io/badge/Platform-Windows%20Desktop-111827)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%2B%20React%20%2B%20TypeScript-0F766E)
![Desktop](https://img.shields.io/badge/Desktop-Electron-1D4ED8)
![Output](https://img.shields.io/badge/Output-PNG-FF5722)
![Docs](https://img.shields.io/badge/Docs-6%20Languages-7C3AED)
![Release](https://img.shields.io/github/v/release/Qrzzzz/lyrics-card-generator?include_prereleases)

</div>

---

<img
  align="right"
  src="./public/app-icon.png"
  alt="Lyrics Card Generator icon"
  width="200"
/>

## 📦 下载与安装

请前往 [GitHub Releases](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest) 下载最新版：

* 推荐普通用户下载安装版：`Lyrics Card Generator Setup 5.2.3.exe`
* 不想安装时可下载便携版：`Lyrics Card Generator-5.2.3-portable.exe`

安装版适合长期使用；便携版适合临时运行、测试或放在移动硬盘中使用。

> 当前版本未进行代码签名。Windows 可能显示 SmartScreen 提示，这是未签名个人应用常见现象。

### v5.2.3 更新重点

* 修复同一标签同时存在已发布 Release 与草稿 Release 时，发布校验可能下载错误附件集的问题。
* 发布流程会记录并只校验本次创建的草稿 Release ID，逐项核对 Setup、便携版、SBOM、SHA256SUMS 与 attestation 后再发布。
* 同标签已发布版本会提前阻止流程；重跑时只清理同标签残留草稿，避免重复 Release 或不完整附件被误认为成功。
* 应用功能与 v5.2.2 保持一致，本版本仅修复发布与供应链验证流程。

## 🌐 多语言发布说明

GitHub Release 默认展示简体中文摘要，完整说明见：
[简体中文](./docs/releases/v5.2.3.zh-CN.md) · [繁體中文](./docs/releases/v5.2.3.zh-TW.md) · [English](./docs/releases/v5.2.3.en.md) · [Français](./docs/releases/v5.2.3.fr.md) · [日本語](./docs/releases/v5.2.3.ja.md) · [Español](./docs/releases/v5.2.3.es.md)

<a id="主要功能"></a>

## ✨ 主要功能

### 🎨 图片生成与画布布局

* 生成高质感歌词分享图片
* 支持竖版、横版和自定义画布尺寸
* 横版布局基于安全区域重构，封面列、内容列和底部信息更稳定
* 竖版自定义尺寸支持基于真实 DOM 测量的自动高度
* 支持导出高清 PNG 图片

### 📝 歌词排版与翻译

* 支持歌词原文与翻译并排排版
* 支持按当前界面语言拆分原文 / 译文，包括简体中文、繁体中文、英文、法语、日语、西班牙语目标译文
* 支持兼容 OpenAI Chat Completions 的 AI 歌词翻译，可配置厂商 Base URL、模型、API Key、6 个默认预设、最多 2 个自定义预设、Reasoning 和流式输出

### 🎵 歌曲搜索、音乐链接与本地文件解析

* 支持通过网易云音乐搜索歌名、歌手或专辑，并从候选结果导入歌曲信息与歌词
* 支持 Spotify、Apple Music、网易云音乐、QQ 音乐链接解析
* 支持本地 MP3 / FLAC 元数据解析，尝试读取标题、艺人、专辑、封面和内嵌歌词

### ✍️ 手动编辑与素材上传

* 支持手动填写歌曲名、艺人、封面和歌词
* 支持本地封面上传

### 🌈 视觉样式与品牌信息

* 支持从封面提取色彩并生成渐变背景
* 软件界面支持专辑封面动态取色、深色、浅色、深色亚克力和浅色亚克力五种外观模式
* 支持平台 Logo、分享人、生成水印

### 🔤 字体与多语言界面

* 支持思源黑体 / 思源宋体两套字体方案、自定义中日韩 / 西文字体、系统字体选择弹窗与真实歌词字体预览
* 支持简体中文 / 繁體中文 / English / Français / 日本語 / Español 界面切换

### 🚀 版本更新

* 支持从 GitHub Releases 检查新版本

## 🪟 Windows 桌面版说明

桌面版保留了原本的 Next.js Web 界面和 API 路由，并通过 Electron 包装为本地应用。

运行 EXE 后，应用会在本机启动一个本地 Next 服务，并在桌面窗口中打开它。普通用户只需要双击 EXE 使用，不需要了解 Node.js、npm 或本地开发环境。

桌面版可以离线启动。以下功能在离线状态下仍可使用：

* 手动编辑歌曲信息
* 手动编辑歌词和翻译
* 上传本地封面
* 解析本地 MP3 / FLAC 文件中的元数据和内嵌歌词
* 调整样式
* 生成和导出 PNG 图片

以下功能需要联网：

* 音乐平台链接解析
* 网易云音乐搜索与歌词获取
* 远程封面加载
* 自动歌词获取
* AI 歌词翻译
* GitHub 检查更新

## 🚀 使用方式

1. 启动应用。
2. 在“搜索网易云音乐”中输入歌名、歌手或专辑关键词，选择候选歌曲后自动填入歌曲信息、封面和歌词。
3. 也可以粘贴 Spotify、Apple Music、网易云音乐或 QQ 音乐链接，或上传本地 MP3 / FLAC 读取元数据。
4. 编辑歌词和翻译；可使用 AI 翻译，也可将原文 / 译文交替行按当前界面语言自动拆分。
5. 调整画布比例、字体方案（中日韩 / 西文）、字号、颜色、边框、水印等样式。
6. 在右侧预览卡片。
7. 点击“完成并导出”，保存 PNG 图片。

## 🔄 检查更新

应用内提供“检查更新”按钮。
它会通过本地 Next API 路由请求本项目的 GitHub Releases，比较当前版本和最新发布版本，并优先识别安装版和便携版下载资产。
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

维护者可参考 [桌面维护文档](./docs/desktop.md) 查看架构、运行边界和发布前检查项。

## 📜 常用脚本

```bash
npm run dev             # 启动 Web 开发服务器
npm run build           # 构建 Next.js 应用
npm run typecheck       # TypeScript 类型检查
npm run desktop:dev     # 启动 Electron 开发模式
npm run desktop:pack    # 构建 unpacked 桌面目录
npm run desktop:build   # 构建 Windows 安装版和便携版
npm run parse:test      # 测试歌曲链接解析
npm run core:test       # 测试 3.0 核心纯函数
```

## 🙏 致谢

感谢 [Apple Music](https://music.apple.com/)。这个项目的彩色渐变、流光背景审美，以及早期歌词卡片排版方向，受到 Apple Music 视觉体验的启发。本项目与 Apple Music 没有关联，也不代表 Apple Music 官方立场。

感谢 [思源黑体](https://github.com/adobe-fonts/source-han-sans) 和 [思源宋体](https://github.com/adobe-fonts/source-han-serif)。它们为中文歌词卡片提供了稳定、清晰、有分量的字体基础。

感谢 [OpenAI Codex](https://openai.com/codex/)。它把许多零散想法转化为可运行的代码、桌面版构建流程和实际功能。

感谢 [ChatGPT 5.6 Sol](https://chatgpt.com/) 在开发过程中进行问题定位、方案设计、修复复核和验收检查。

感谢 [ReactBits](https://www.reactbits.dev/) 提供的多种 UI 创意，包括 Spark Cursor 等动效灵感。

感谢 Rangerov 对此项目的关注和提出意见。

感谢 [V0idream](https://github.com/V0idream) 提出的代码瘦身建议，[`v1.1.0`](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0) 已据此进行了相关优化。

感谢以下歌曲及其创作者。它们作为项目样例，帮助验证歌词卡片在不同语言、字体、翻译长度和排版节奏下的显示效果。

<details>
<summary>展开查看歌曲样例</summary>

| 歌曲         | 专辑                         | 艺术家                                                    |
| ---------- | -------------------------- | ------------------------------------------------------ |
| 《opposite》 | *emails i can't send fwd:* | [Sabrina Carpenter](https://www.sabrinacarpenter.com/) |
| 《勇者》       | *THE BOOK 3*               | [YOASOBI](https://www.yoasobi-music.jp/)               |
| 《光辉岁月》    | *命运派对*                   | [Beyond](https://music.apple.com/cn/artist/beyond/79668659) |
| 《Opalite》 | *The Life of a Showgirl* | [Taylor Swift](https://www.taylorswift.com/)                |

</details>

也感谢这些开源项目及其维护者：[Next.js](https://nextjs.org/)、[React](https://react.dev/)、[TypeScript](https://www.typescriptlang.org/)、[Tailwind CSS](https://tailwindcss.com/)、[Electron](https://www.electronjs.org/)、[electron-builder](https://www.electron.build/)、[html-to-image](https://github.com/bubkoo/html-to-image)、[Framer Motion](https://motion.dev/)、[Lucide React](https://lucide.dev/)、[Cheerio](https://cheerio.js.org/)、[Zod](https://zod.dev/)，以及构成现代前端生态的众多工具链。没有这些基础设施，这个项目不会以现在的形态出现。

## 📄 许可证

本项目采用自定义 Source Available License，而不是传统开源许可证。

你可以为了个人、非商业、学习、评估目的查看、下载、运行源码，并进行仅限个人使用的私下修改。未经作者书面许可，不得商用、再分发、重新打包、公开发布修改版，或基于本项目制作竞争性产品。

本项目依赖的第三方开源组件仍遵循它们各自的许可证。详见 [LICENSE](./LICENSE)。
