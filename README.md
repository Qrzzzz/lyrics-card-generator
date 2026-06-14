# Lyric Card Generator

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

## Windows desktop app

The desktop build keeps the same Next.js WebUI and API routes, then wraps them
with Electron. The EXE starts an embedded local Next standalone service on
`127.0.0.1` and opens it in a desktop window. Users do not need to install
Node.js or deploy the app to Vercel.

Desktop user flow:

1. Download either the installer EXE or the portable EXE from `release/`.
2. Double-click the EXE.
3. Create and export lyric cards with the same workflow as the WebUI.

Offline behavior:

- The app can start offline.
- Manual song info editing, lyric editing, local cover upload, style changes,
  and PNG export remain available offline.
- Apple Music, NetEase Cloud Music, QQ Music parsing, remote cover loading, and
  LRCLIB lyric fetching require internet access because those platforms are
  data sources.

Unsigned local builds may show a Windows SmartScreen warning.

## Developer desktop build

Run desktop development mode:

```bash
npm run desktop:dev
```

Build an unpacked desktop directory for inspection:

```bash
npm run desktop:pack
```

Build both Windows installer and portable EXE:

```bash
npm run desktop:build
```

Desktop artifacts are written to `release/`. The bundled Next standalone server
is prepared in `dist-desktop/server`.

## Rollback

The original WebUI baseline was frozen before desktop changes:

- Branch: `backup/original-webui-20260612`
- Tag: `backup-webui-before-exe-20260612`
- Source archive: `backups/lyrics-card-generator-webui-backup-20260612.zip`

To inspect the original WebUI:

```bash
git switch backup/original-webui-20260612
```

To return to this desktop work branch:

```bash
git switch feature/desktop-exe
```

To create a new recovery branch from the backup tag:

```bash
git switch -c restore/original-webui backup-webui-before-exe-20260612
```

## Fonts

The project keeps the required local font files under `public/fonts` and loads them with CSS `@font-face` rules from `/fonts/...`:

- `public/fonts/SourceHanSansSC-Heavy.otf`
- `public/fonts/SourceHanSerifSC-Heavy.otf`

Do not remove these files. They are runtime assets for preview rendering and PNG export, and keeping them in `public/fonts` avoids duplicating the large OTF files through `next/font/local` in the desktop bundle.

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
