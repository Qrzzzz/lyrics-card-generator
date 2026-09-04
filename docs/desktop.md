# Windows desktop maintenance guide

[Documentation index](./README.md) · [Development guide](./development.en.md)

This document defines the durable architecture, security boundaries, generated outputs, and verification expectations for the Windows x64 desktop app. Version-specific user changes belong in `docs/releases/`; active defects belong in GitHub Issues.

## Architecture

The desktop app packages three layers:

1. The shared Next.js UI and local API routes.
2. A cleaned Next.js standalone service bundled under the app resources.
3. An Electron shell responsible for the window, local-service lifecycle, native persistence, file selection, system fonts, and restricted IPC.

In development, `scripts/start-electron-dev.mjs` allocates an available loopback port and starts Next.js plus Electron. In a packaged build, Electron starts the bundled service on a dynamic `127.0.0.1` port, waits for its readiness contract, and then opens only the app's validated local origin. Both launch paths inject that exact dynamic URL as the mutation API's canonical origin and explicitly disable proxy-header trust in the child server.

The local HTTP service is an implementation detail, not a LAN service or a remote deployment. Changes to host binding, readiness, origin validation, navigation policy, IPC, or startup secrets are security-sensitive and require their focused tests.

## Runtime boundaries

The app can start without internet access because the UI, local API server, fonts, and icon are packaged together.

Offline-supported paths:

- Manual song, artist, album, lyric, and translation editing.
- Local cover upload.
- Local MP3 / FLAC / M4A metadata, artwork, and embedded-lyric parsing when present in the file.
- Canvas, typography, color, layout, watermark, and other style controls.
- PNG, WebP, and JPG preview and export.
- Desktop import history and manual saves that do not require a missing local file to be relocated.

Online-dependent paths:

- Spotify, Apple Music, NetEase Cloud Music, and QQ Music link parsing.
- NetEase Cloud Music search and lyric retrieval.
- Remote cover and LRCLIB lyric fetching.
- AI translation through a configured compatible provider.
- GitHub Releases update checks.

An offline-capable shell does not imply that previously referenced remote covers, deleted local audio files, or uncached network data can be recovered offline.

## Native data and privacy

- Electron stores preferences and desktop history under its per-user application-data directory, not in the installation directory.
- Import history stores a validated reference and parsed state, not the audio file bytes. A moved or deleted source may require relocation.
- Manual saves are explicit. They must not be described as automatic document backup.
- AI API keys use the desktop secure-storage path when available. Never add keys to logs, exported documents, history records, or repository fixtures.
- Clear/reset and shutdown behavior are covered by lifecycle and persistence tests; changes must preserve cancellation and write-order semantics.

## Build pipeline and outputs

The canonical commands and environment setup are documented in the [development guide](./development.en.md). The desktop pipeline is:

```text
npm run typecheck
        ↓
npm run build
        ↓
npm run desktop:prepare
        ↓
electron-builder
```

Generated locations:

| Path | Contents |
| --- | --- |
| `.next/standalone/` | Next.js standalone build before desktop cleanup |
| `dist-desktop/server/` | Bundled local server and approved runtime closure |
| `dist-desktop/app/` | Minimal Electron app, copied main-process modules, and generated packaging manifest |
| `release/win-unpacked/` | Inspectable unpacked Windows app |
| `release/Lyrics.Card.Generator.Setup.<version>.exe` | Sole public Windows x64 NSIS Setup artifact |

Do not patch generated files in `dist-desktop/` or `release/`. Fix their source or preparation script and rebuild.

## Verification matrix

### Source and runtime contracts

```bash
npm run typecheck
npm run lint
npm run stability:test
npm run electron-runtime:coverage
npm run core:test
```

These gates cover Electron static policy, single-instance ownership, settings and history behavior, shutdown coordination, IPC/runtime boundaries, and shared product contracts.

### Packaged directory

```bash
npm run desktop:pack
npm run desktop:packaged-assets-test
npm run desktop:interaction-test
```

The interaction suite expects a current unpacked build and covers single-instance behavior, startup origin, settings, and import/history flows. Rebuild before interpreting a failure against source changes.

### Final Setup bytes

```bash
npm run desktop:build
npm run desktop:final-artifact-smoke
npm run desktop:size
```

Final-artifact smoke is distinct from testing `win-unpacked`: it silently installs the actual Setup bytes, launches the installed app, verifies the packaged Electron/runtime and font-license contracts, closes it, and uninstalls it. Release owns this check and rejects any extra executable, including a portable build. Ordinary Windows CI uses `desktop:pack` and tests the unpacked production app; it does not generate or install Setup. Installer-specific failures are therefore caught at release time, or by running the commands above before tagging.

Optional diagnostics:

```bash
npm run desktop:startup-test
npm run desktop:startup-benchmark
npm run desktop:visual-diagnostic
```

Use performance and visual diagnostics for evidence, not as substitutes for deterministic pass/fail gates.

## Release acceptance

Before publishing a desktop release, bind results to the exact tag commit and verify all of the following:

- The standard CI, browser, accessibility, and render-boundary jobs pass.
- The production dependency advisory gate and font-license gate pass.
- The sole Windows x64 Setup output is produced from the tag commit.
- Full desktop interactions pass in the required Windows CI job for that exact final main-push SHA. Release reuses this source-level result rather than running the suite a third time after PR and main CI.
- Packaged assets pass again on the newly built release outputs, and final-artifact smoke validates the actual Setup; unpacked CI execution is not evidence of installation or uninstallation.
- The unpacked app and installed Setup app exit without orphaned product processes, and silent uninstall succeeds.
- Required hashes, SBOM, attestations, and release assets are generated and verified by the release workflow.
- User-facing release notes match the delivered behavior and six-language release-note structure.

Building locally does not authorize a tag or GitHub Release and is not proof that the published remote assets match local files.

## Troubleshooting order

1. Confirm the source commit and whether `release/` was built from that commit.
2. Delete stale generated output through the normal build scripts, then rebuild; do not hand-edit it.
3. Run the narrow startup, static-asset, IPC, settings, or history test that matches the symptom.
4. Distinguish a product failure from missing Playwright browsers, locked files, antivirus interference, or a stale unpacked directory.
5. Preserve logs and process evidence before changing the environment when the failure will be used as release evidence.

The Windows build is currently unsigned, so SmartScreen may warn on first launch. That user-facing warning is not itself a startup-test failure.
