# Desktop Migration Checklist

This checklist is the acceptance boundary for the Electron desktop build. The desktop app must preserve the existing WebUI behavior, defaults, visual output, and workflow.

## Protected WebUI Areas

- `components/editor/LyricEditor.tsx` remains the core UI entry.
- `app/page.tsx` continues to render `LyricEditor`.
- `app/api/parse-song`, `app/api/image-proxy`, and `app/api/fetch-lyrics` continue to run locally.
- `lib/export-image.ts` continues to use the existing DOM-to-PNG export path.
- `public/fonts` and `public/platform-icons` are bundled into the desktop release.

## Functional Acceptance

- [x] App starts from the Windows EXE without a user-installed Node.js runtime.
- [x] Closing the app leaves no orphaned local Next service process.
- [x] Web mode still runs with `npm run dev`.
- [x] Production Web build still passes with `npm run build`.
- [x] Desktop build creates Windows installer and portable EXE outputs.
- [x] Apple Music link parsing works.
- [x] NetEase Cloud Music link parsing works.
- [x] QQ Music link parsing works.
- [x] Manual song title, artist, and album input path remains present.
- [x] Lyrics can be manually edited.
- [x] Translation text can be edited.
- [x] Translation display can be shown and hidden.
- [x] Instrumental mode remains present.
- [x] Remote cover loading works when online.
- [x] Local cover upload path remains present.
- [x] Cover proxy works through the local API route.
- [x] Cover palette extraction remains wired through the unchanged WebUI.
- [x] Extracted theme colors are applied through the unchanged WebUI.
- [x] Portrait card mode works.
- [x] Landscape card mode remains present.
- [x] Preset size selection remains present.
- [x] Custom width and height work.
- [x] Auto-height remains present in portrait custom mode.
- [x] Font selection remains present.
- [x] Font size adjustment remains present.
- [x] Line-height adjustment remains present.
- [x] Corner radius, shadow, border, and frame controls remain present.
- [x] Watermark controls remain present.
- [x] Shared-by text remains present.
- [x] Platform badge display remains present.
- [x] Apple Music, NetEase, QQ Music, and unknown platform states remain supported.
- [x] Chinese and English UI switching works.
- [x] Locale setting persists after reload.
- [x] PNG export works in Chromium using the existing DOM-to-PNG path.
- [x] PNG output keeps the expected 2x size from local fonts and bundled platform icon resources.
- [x] Offline startup path is local-only and does not depend on cloud deployment.
- [x] Offline manual editing, local cover use, and PNG export remain local WebUI paths.
- [x] Online-only parsing and LRCLIB lyric fetching are documented as data-source dependencies.

## Backup Points

- Baseline branch: `backup/original-webui-20260612`
- Baseline tag: `backup-webui-before-exe-20260612`
- Source archive: `backups/lyrics-card-generator-webui-backup-20260612.zip`

## Verification Evidence

- `npm run typecheck` passed.
- `npm run build` passed and produced Next standalone output with local API routes.
- `npm run desktop:pack` passed and produced `release/win-unpacked`.
- `npm run desktop:build` passed and produced installer and portable EXE files in `release/`.
- `release/win-unpacked/Lyrics Card Generator.exe` started a bundled `resources/server/server.js` process on `127.0.0.1` and closed with zero residual app processes.
- `release/Lyrics Card Generator-0.1.0-portable.exe` started a bundled `resources/server/server.js` process from its temp extraction directory and closed with zero residual app processes.
- Playwright opened the standalone UI, verified default Chinese UI, default lyrics and translation, all main steps, English language switch, and locale persistence after reload.
- Playwright clicked the final `完成并导出` action and downloaded `lyric-card-opposite.png` at `2080x2160`, matching the default `1040x1080` card at 2x quality.
- `npm run parse:test` passed for Apple Music, NetEase Cloud Music, and QQ Music sample links.
- Local `GET /api/image-proxy` returned a remote cover image through the standalone server.
- Local `POST /api/fetch-lyrics` returned an LRCLIB candidate for `Never Gonna Give You Up / Rick Astley`.
