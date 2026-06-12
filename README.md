# Lyric Glass Card

First MVP of a high-polish lyric share image generator.

## 快速启动

Windows 用户：

双击运行：

```bat
scripts/start-dev.bat
```

或在项目根目录执行：

```bat
scripts\start-dev.bat
```

也可以直接双击根目录的 `start.bat`。

macOS / Linux 用户：

```bash
chmod +x scripts/start-dev.sh
./scripts/start-dev.sh
```

启动成功后访问：

```text
http://localhost:3000
```

一键启动脚本只用于本地开发环境，不负责生产部署。

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Fonts

The project loads these local fonts through `next/font/local`:

- `public/fonts/SourceHanSansSC-Heavy.otf`
- `public/fonts/SourceHanSerifSC-Heavy.otf`

The original root-level font files were left in place.

## Platform icons

Platform badges use local SVG files so PNG export does not depend on remote logo
URLs:

- `public/platform-icons/apple-music.svg`
- `public/platform-icons/qq-music.svg`
- `public/platform-icons/netease-music.svg`

Replace these files with official artwork if you need exact brand assets.

## Styling controls

The editor supports preset ratios plus custom canvas width/height, optional
auto-height estimation, automatic/preset/custom text colors, platform badge
visibility, and independent frame/shadow toggles.

## Link parsing

`POST /api/parse-song` accepts a direct URL or platform share text, extracts the
first http/https URL, follows redirects, detects Apple Music, NetEase Cloud
Music, or QQ Music, then tries the platform-specific parser before falling back
to Open Graph / Twitter Card metadata. It does not fetch or store full lyrics.

Command-line parser check:

```bash
npm run parse:test -- "https://music.163.com/song?id=1827600686"
npm run parse:test -- "https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV"
```

The command prints JSON with `ok`, `data.source`, `data.title`, `data.artist`,
`data.coverUrl`, `data.finalUrl`, and `data.parseMethod`. On failure it prints
the extracted URL, final URL, detected source, attempted methods, and error.

`GET /api/image-proxy?url=...` proxies image resources for safer PNG export,
with http/https-only validation, private-network blocking, content-type checks,
timeouts, and response size limits.
