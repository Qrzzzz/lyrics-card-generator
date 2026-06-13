# Lyrics Card Generator v0.1.0

Initial Windows desktop release / Windows 桌面版初版发布

## 中文更新日志

### 发布概览

这是 Lyrics Card Generator 的第一个 Windows 桌面版发布。这个版本将原有的 Next.js WebUI 歌词卡片生成器完整封装为可直接运行的 Windows EXE 应用。用户不需要安装 Node.js，不需要手动启动开发服务器，也不需要把项目部署到 Vercel、Netlify 或任何云服务。

桌面版采用 Electron + Next standalone 本地服务方案：应用启动后会自动在本机 `127.0.0.1` 上启动内置 Next 服务，并在桌面窗口中加载本地地址。所有页面和 API routes 都在本地运行；Apple Music、网易云音乐、QQ 音乐、远程封面和 LRCLIB 只作为数据来源，不是应用部署依赖。

### 下载选择

- 安装版：`Lyrics Card Generator Setup 0.1.0.exe`
- 便携版：`Lyrics Card Generator-0.1.0-portable.exe`

建议普通用户优先使用安装版。如果你只是想临时试用，或不想写入安装目录，可以使用便携版。

### 核心功能

- 歌曲链接解析：支持 Apple Music、网易云音乐、QQ 音乐链接。
- 手动输入歌曲信息：可手动编辑歌曲名、歌手名、专辑名和封面链接。
- 歌词编辑：支持手动输入和编辑歌词。
- 翻译编辑：支持逐行翻译文本，并可显示或隐藏翻译。
- 纯音乐模式：支持无歌词或纯音乐内容展示。
- 封面能力：支持远程封面、本地封面上传、封面代理和封面取色。
- 视觉样式：支持竖版/横版、尺寸设置、自动高度、字体、字号、行距、文字颜色、圆角、边框、阴影、平台 Logo、水印和分享者文字等样式控制。
- 语言切换：支持中文和 English UI，并保留语言设置。
- PNG 导出：保留原有 DOM-to-PNG 导出方式，默认高清 2x 输出，不改用 Electron 截图。

### 桌面版体验

- 双击 EXE 即可启动。
- 默认以最大化窗口打开。
- 应用图标已统一替换为新的透明圆角图标，覆盖安装包、便携版、任务栏、窗口标题栏、Web favicon 和软件内标题区。
- 关闭窗口时会自动关闭内置本地服务，避免残留后台进程。
- 外部链接会交给系统浏览器打开，不会在应用内部乱跳。

### 离线和联网说明

离线可用：

- 打开应用。
- 手动输入歌曲信息。
- 手动编辑歌词和翻译。
- 使用本地封面。
- 调整卡片样式。
- 导出 PNG。

需要联网：

- Apple Music / 网易云音乐 / QQ 音乐链接解析。
- 远程封面加载。
- LRCLIB 自动歌词获取。

### 初版限制

- 这个版本没有自动更新功能。
- 这个版本没有代码签名，Windows 可能显示 SmartScreen 提示。
- 安装版和便携版均为 Windows x64 构建。
- 远程解析和歌词获取依赖第三方数据源的可用性。

### 校验信息

安装版：

```text
File: Lyrics Card Generator Setup 0.1.0.exe
Size: 246,437,305 bytes
SHA256: 8D0685A2CDABF2DBF3E9EDE8CE0929EDCF13DF8AEF80CF8C4B28F58B206BD4F3
```

便携版：

```text
File: Lyrics Card Generator-0.1.0-portable.exe
Size: 245,841,606 bytes
SHA256: 827183226788DA4A035CFBBE42DFBC0488921D290C40F08F471366BEE1E48AF2
```

### 本次验证

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run desktop:build` 通过。
- 安装版和便携版产物已生成。
- 便携版和 unpacked EXE 已验证可启动内置 Next 服务。
- EXE 启动后默认最大化。
- 关闭应用后无残留应用进程。
- Apple Music、网易云音乐、QQ 音乐解析通过样例验证。
- 本地封面代理 API 验证通过。
- LRCLIB 自动歌词获取通过样例验证。
- PNG 导出验证通过，默认 `1040x1080` 卡片以 `2080x2160` 输出。
- 新图标资源已进入 `build/icon.ico`、`app/icon.png`、`public/app-icon.png` 和打包后的 `resources/icon.ico`。

---

## English Release Notes

### Overview

This is the first Windows desktop release of Lyrics Card Generator. It packages the existing Next.js WebUI lyric card generator as a ready-to-run Windows EXE. Users do not need to install Node.js, start a development server manually, or deploy the app to Vercel, Netlify, or any other cloud service.

The desktop app uses Electron plus a local Next standalone server. When the EXE starts, it automatically launches a bundled Next service on `127.0.0.1` and opens that local address in a desktop window. All pages and API routes run locally. Apple Music, NetEase Cloud Music, QQ Music, remote covers, and LRCLIB are data sources only; they are not deployment dependencies.

### Downloads

- Installer: `Lyrics Card Generator Setup 0.1.0.exe`
- Portable: `Lyrics Card Generator-0.1.0-portable.exe`

Use the installer for normal use. Use the portable build if you only want to try the app or avoid installing it into a system application directory.

### Core Features

- Song link parsing for Apple Music, NetEase Cloud Music, and QQ Music.
- Manual song metadata editing for title, artist, album, and cover URL.
- Manual lyric editing.
- Translation editing with show/hide support.
- Instrumental mode for tracks without lyrics.
- Remote covers, local cover upload, local cover proxying, and cover palette extraction.
- Visual controls for portrait/landscape layout, canvas size, auto height, fonts, font size, line height, text color, radius, frame, shadow, platform logo, watermark, and shared-by text.
- Chinese and English UI switching with local persistence.
- PNG export through the existing DOM-to-PNG pipeline, keeping high-quality 2x output without replacing it with Electron screenshots.

### Desktop Experience

- Start the app by double-clicking the EXE.
- The window opens maximized by default.
- The app icon has been replaced everywhere with the new transparent rounded icon, including the installer, portable EXE, taskbar, window title, Web favicon, and in-app header.
- Closing the window also stops the bundled local service, preventing orphaned background processes.
- External links open in the system browser.

### Offline and Online Behavior

Available offline:

- Open the app.
- Enter song metadata manually.
- Edit lyrics and translations manually.
- Use a local cover image.
- Adjust card styling.
- Export PNG images.

Requires internet access:

- Apple Music / NetEase Cloud Music / QQ Music link parsing.
- Remote cover loading.
- LRCLIB automatic lyric fetching.

### Initial Release Limitations

- No auto-update support yet.
- The build is unsigned, so Windows may show a SmartScreen warning.
- Installer and portable builds are Windows x64.
- Remote parsing and lyric fetching depend on third-party data source availability.

### Checksums

Installer:

```text
File: Lyrics Card Generator Setup 0.1.0.exe
Size: 246,437,305 bytes
SHA256: 8D0685A2CDABF2DBF3E9EDE8CE0929EDCF13DF8AEF80CF8C4B28F58B206BD4F3
```

Portable:

```text
File: Lyrics Card Generator-0.1.0-portable.exe
Size: 245,841,606 bytes
SHA256: 827183226788DA4A035CFBBE42DFBC0488921D290C40F08F471366BEE1E48AF2
```

### Verification

- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run desktop:build` passed.
- Installer and portable artifacts were generated.
- Portable and unpacked EXE builds were verified to start the bundled Next service.
- The EXE opens maximized by default.
- Closing the app leaves no residual app processes.
- Apple Music, NetEase Cloud Music, and QQ Music parsing were verified with sample links.
- The local cover proxy API was verified.
- LRCLIB lyric fetching was verified with a sample track.
- PNG export was verified: the default `1040x1080` card exported as `2080x2160`.
- The new icon assets are present in `build/icon.ico`, `app/icon.png`, `public/app-icon.png`, and the packaged `resources/icon.ico`.

