# PR: Package Lyric Card Generator as a Windows Desktop App

## Backup

- Baseline branch: `backup/original-webui-20260612`
- Baseline tag: `backup-webui-before-exe-20260612`
- Source archive: `backups/lyrics-card-generator-webui-backup-20260612.zip`
- Baseline commit: `e4a92d0`

## Technical Route

This change keeps the existing Next.js WebUI and wraps it with Electron. The packaged EXE starts a bundled Next standalone server on `127.0.0.1` using an available local port, then opens that local address in an Electron window.

All existing API routes continue to run locally. Apple Music, NetEase Cloud Music, QQ Music, cover images, and LRCLIB are data sources only, not deployment dependencies.

## Main Additions

- `electron/main.js`: Electron main process, local port selection, bundled Next server startup, external-link handling, and child-process cleanup.
- `scripts/prepare-electron-dist.mjs`: Copies Next standalone output, static files, public assets, fonts, and platform icons into `dist-desktop/server`.
- `scripts/start-electron-dev.mjs`: Starts Next dev and Electron together for local desktop development.
- `build/icon.ico`: Windows application icon generated from the existing music-note visual identity.
- `docs/desktop-migration-checklist.md`: Acceptance checklist and verification evidence.
- `docs/desktop-runbook.md`: Build, run, and rollback instructions.
- `docs/desktop-known-issues.md`: Known issues and validation notes.

## Existing Core Files Preserved

The core WebUI and business logic are not rewritten. These areas remain intact:

- `components/editor/LyricEditor.tsx`
- `components/editor/SongLinkParser.tsx`
- `components/editor/LyricsFetchPanel.tsx`
- `components/editor/ExportPanel.tsx`
- `app/api/parse-song/route.ts`
- `app/api/image-proxy/route.ts`
- `app/api/fetch-lyrics/route.ts`
- `lib/export-image.ts`
- `public/fonts`
- `public/platform-icons`

## Build Outputs

- Installer: `release/Lyrics Card Generator Setup 0.1.0.exe`
- Portable: `release/Lyrics Card Generator-0.1.0-portable.exe`
- Unpacked app: `release/win-unpacked/Lyrics Card Generator.exe`

## Verification

- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run desktop:pack` passed.
- `npm run desktop:build` passed.
- Unpacked EXE starts the bundled Next server and exits with no residual app processes.
- Portable EXE starts the bundled Next server from its temp extraction directory and exits with no residual app processes.
- Original Web dev mode starts with `npm run dev`.
- Standalone local `POST /api/parse-song` works.
- `npm run parse:test` passed for Apple Music, NetEase Cloud Music, and QQ Music sample links.
- Local `GET /api/image-proxy` returned a proxied remote cover image.
- Local `POST /api/fetch-lyrics` returned an LRCLIB candidate for a known track.
- Playwright verified the default UI, step navigation, language switch, reload persistence, and existing PNG export.
- Exported PNG was `2080x2160`, matching the default `1040x1080` card at 2x quality.

## Known Issues

No desktop-specific runtime issues are currently confirmed.

The installer EXE was built but not installed on this machine to avoid modifying installed applications. The portable EXE and unpacked EXE were runtime-tested.

