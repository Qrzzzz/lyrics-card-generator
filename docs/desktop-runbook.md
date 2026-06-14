# Desktop Runbook

## Technical Route

The desktop app uses Electron as a shell around the existing Next.js app. In production, the EXE starts a local Next standalone service on `127.0.0.1` using an available port, then opens that local address in an Electron window.

This keeps all existing Next API routes local. Apple Music, NetEase Cloud Music, QQ Music, cover URLs, and LRCLIB remain external data sources only; they are not deployment dependencies.

## Build Commands

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

Build unpacked desktop output for inspection:

```bash
npm run desktop:pack
```

Build installer and portable Windows EXE:

```bash
npm run desktop:build
```

Desktop artifacts are written to `release/`.

## Rollback

The original WebUI state is preserved in three places:

- Branch: `backup/original-webui-20260612`
- Tag: `backup-webui-before-exe-20260612`
- Archive: `backups/lyrics-card-generator-webui-backup-20260612.zip`

To inspect the original WebUI from Git:

```bash
git switch backup/original-webui-20260612
```

To return to the desktop work branch:

```bash
git switch feature/desktop-exe
```

To create a fresh branch from the original tag:

```bash
git switch -c restore/original-webui backup-webui-before-exe-20260612
```

## User Notes

- The app can open offline.
- Offline mode supports manual editing, local cover use, style adjustment, and PNG export.
- Link parsing, remote cover loading, and LRCLIB lyric fetching require internet access.
- The first unsigned Windows build may show a SmartScreen warning.
