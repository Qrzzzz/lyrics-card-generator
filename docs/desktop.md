# Desktop Maintenance Guide

This document is the long-term maintainer guide for the Windows desktop build. It replaces the old one-off desktop PR summary, migration checklist, runbook, and known-issues files.

## Architecture

The desktop app keeps the existing Next.js WebUI and wraps it with Electron.

In production, the Windows executable starts a bundled Next standalone service on `127.0.0.1` using an available local port, then opens that local address in an Electron window.

The existing Next API routes continue to run locally inside the packaged app. Music platform parsing, remote covers, LRCLIB lyrics, AI translation, and GitHub release checks are external data-source dependencies only; they are not deployment dependencies for starting the desktop shell.

## Runtime Boundaries

The app can start offline because the UI and local API server are bundled into the desktop package.

Offline-supported paths:

- Manual song, artist, album, lyric, and translation editing.
- Local cover upload.
- Local MP3 / FLAC metadata parsing when the required metadata is embedded in the file.
- Style adjustment.
- PNG export through the existing DOM-to-PNG path.

Online-dependent paths:

- Spotify, Apple Music, NetEase Cloud Music, and QQ Music link parsing.
- NetEase Cloud Music search and lyric retrieval.
- Remote cover loading.
- LRCLIB lyric fetching.
- AI lyric translation through configured compatible providers.
- GitHub Releases update checks.

## Development Commands

Install dependencies:

```bash
npm install
```

Run the original WebUI:

```bash
npm run dev
```

Run desktop development mode:

```bash
npm run desktop:dev
```

Build an unpacked desktop output for inspection:

```bash
npm run desktop:pack
```

Build the Windows installer and portable executable:

```bash
npm run desktop:build
```

Desktop artifacts are written to `release/`.

The packaged Next standalone service is prepared under:

```text
dist-desktop/server
```

## Release Checks

Before publishing a desktop release, verify at minimum:

- `npm run typecheck` passes.
- `npm run build` passes.
- `npm run desktop:pack` produces an unpacked desktop app.
- `npm run desktop:build` produces installer and portable outputs in `release/`.
- The unpacked executable starts the bundled local server and exits without orphaned app processes.
- The portable executable starts the bundled local server and exits without orphaned app processes.
- Web development mode still starts with `npm run dev`.
- Representative platform parsing, cover proxying, lyric fetching, language switching, persistence, and PNG export paths still work.

## User-Facing Notes

The Windows build is currently unsigned. Windows SmartScreen may warn on first launch; this is expected for an unsigned personal application.

Keep version-specific release details in `docs/releases/`. Keep active defects in GitHub Issues instead of adding temporary known-issue snapshots to this file.
