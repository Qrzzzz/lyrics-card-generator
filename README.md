# Lyric Glass Card

A local-first lyric share image generator for polished portrait and landscape cards.

The app accepts manual lyrics and song metadata, can parse basic metadata from music links, extracts colors from cover art, previews the card in the browser, and exports the card as PNG.

## Status and license

This repository is prepared for public source viewing, not npm package publishing. `package.json` intentionally keeps `"private": true`.

No open-source license has been selected yet. Unless a license is added later, the code and bundled assets are not licensed for reuse, redistribution, or commercial use.

## Requirements

- Node.js LTS, Node 20 or newer recommended.
- npm, installed with Node.js.
- Network access is optional for the editor, but required for music-link parsing, remote cover images, dependency installation, and audit checks.

## Quick start

Windows:

```bat
scripts\start-dev.bat
```

You can also double-click `start.bat` from the project root.

macOS / Linux:

```bash
chmod +x scripts/start-dev.sh
./scripts/start-dev.sh
```

Manual commands:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Useful commands

```bash
npm run typecheck
npm test
npm run build
npm audit --omit=dev
npm run check
```

`npm run check` runs type checking, deterministic tests, production build, and production-dependency audit.

Live parser checks are intentionally separate because they depend on third-party music sites:

```bash
npm run test:parse:live -- "https://music.163.com/song?id=1827600686"
npm run test:parse:live -- "https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV"
```

## Supported link parsing

`POST /api/parse-song` accepts a direct URL or share text, extracts the first http/https URL, follows public-network redirects with validation at every hop, detects Apple Music, NetEase Cloud Music, or QQ Music, then tries a platform parser before falling back to Open Graph / Twitter Card metadata.

Supported examples include:

- NetEase Cloud Music: `music.163.com/song?id=...`, `music.163.com/#/song?id=...`, `y.music.163.com/...`
- QQ Music: `y.qq.com/n/ryqq/songDetail/...`, `i.y.qq.com/...songmid=...`, `i.y.qq.com/...songid=...`
- Apple Music: `music.apple.com/...`

Parsing does not fetch or store full lyrics.

## Lyrics and copyright

Automatic lyric fetching is experimental and uses public metadata search. Results may be incomplete or inaccurate. Users are responsible for confirming they have permission to use any lyrics, cover art, and generated image.

## Assets

The app bundles Source Han font files from the Source Han / Noto CJK family.

The existing SVG files under `public/platform-icons/` are kept for local customization, but the default UI uses neutral text/color platform badges instead of official-looking logo artwork. Confirm brand and trademark usage before enabling those SVGs in a public build.

See `THIRD_PARTY_NOTICES.md` before making this repository public.

## Known limits

- Music platforms can change page markup or API behavior without notice; live parser checks should be run before important demos.
- Remote cover URLs may block browser canvas export; uploading a local cover is the most reliable fallback.
- Landscape cards are optimized for curated lyric excerpts. If the text exceeds the safe export area, the editor shows a warning instead of silently implying the whole text will fit.
