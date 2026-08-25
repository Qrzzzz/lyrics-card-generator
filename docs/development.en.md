# Development guide

[简体中文](./development.zh-CN.md) · [Documentation index](./README.md) · [Desktop maintenance](./desktop.md)

This is the English development entry point for Lyrics Card Generator and is linked from the English, French, Japanese, and Spanish READMEs. Run commands from the repository root; `package.json` is authoritative for script names.

## Requirements

- Git.
- Node.js 22, matching CI and release workflows, with the bundled npm.
- Windows 10/11 x64 for building and validating Windows desktop artifacts. The Web app and most pure Node.js tests can run elsewhere, but that does not validate desktop artifacts.
- The relevant Playwright Chromium, Firefox, or WebKit runtime for browser tests.

The project does not require a repository-level `.env` file. AI provider URLs, models, and API keys are managed in app settings. Never place real secrets in source files, fixtures, logs, or commits.

## Clone and install

```bash
git clone https://github.com/Qrzzzz/lyrics-card-generator.git
cd lyrics-card-generator
npm ci
```

Use `npm install` when intentionally changing dependencies in an existing checkout. Prefer `npm ci` for normal checkouts, CI reproduction, and clean verification because it follows `package-lock.json` exactly.

Install browser runtimes when needed:

```bash
npx playwright install chromium firefox webkit
```

## Start development

### Next.js Web interface

```bash
npm run dev
```

Open `http://localhost:3000`. If the `.next` cache appears stale or damaged, use:

```bash
npm run dev:clean
```

This Web development surface includes Next.js API routes; it is not the static Web Lite artifact.

### Electron desktop interface

```bash
npm run desktop:dev
```

The launcher allocates an available `127.0.0.1` port for the checkout, starts Next.js and Electron together, and cleans up its children when the desktop window exits. Do not hard-code a development port around this launcher.

## Repository map

| Path | Purpose |
| --- | --- |
| `app/` | Next.js pages, layout, and local API routes |
| `components/` | Editor, preview, settings, and shared React components |
| `lib/` | Document transactions, parsers, export, safe fetch, layout, and style logic |
| `electron/` | Electron main process, preload, IPC, security boundaries, and desktop persistence |
| `web-lite/` | Static Web Lite entry point and browser-specific adapters |
| `scripts/` | Builds, regressions, audits, artifact checks, and maintenance tools |
| `tests/` | Playwright tests and test resources |
| `public/` | Runtime icons, fonts, and matching licenses |
| `docs/` | Development, maintenance, security, testing, and release documentation |
| `index.html` | Generated, committed Web Lite artifact; do not edit it by hand |

## Day-to-day verification

Choose the smallest complete set that matches the change:

```bash
npm run typecheck
npm run lint
npm run core:test
npm run build
```

- Markdown-only changes: at minimum check links, heading structure, and `git diff --check`.
- Parser, transaction, export, or security changes: run the focused test and `core:test`.
- Electron changes: add `stability:test`, `electron-runtime:coverage`, or the relevant packaged interaction test.
- Web Lite or shared UI changes: rebuild `index.html`, then run `web-lite:check` and browser smoke tests.
- Accessibility or responsive UI changes: run `a11y:test` and the relevant Playwright suite.

The main static and Node.js CI gate is:

```bash
npm run dependency-audit:gate
npm run web-lite:check
npm run font-license:test
npm run typecheck
npm run lint
npm run stability:test
npm run coverage
npm run electron-runtime:coverage
npm run core:test
npm run build
```

Browser, render-boundary, and Windows packaging gates run in separate CI jobs. A local `build` alone is not equivalent to full CI.

## Web Lite

Web Lite is a static single page built from `web-lite/` and shared components. Its application CSS and JavaScript are inlined into the root `index.html`, while approved fonts and the app icon remain under `public/`. It has no Next.js server or `/api/` runtime.

```bash
npm run web-lite:build   # Regenerate and write index.html
npm run web-lite:check   # Rebuild in a temporary directory and compare without modifying the checkout
npm run pages:prepare    # Create the allowlisted _site/ Pages directory
npm run web-lite:smoke
npm run web-lite:cross-browser-smoke
```

After changing shared UI, styles, fonts, version display, or Web Lite adapters, run `web-lite:build` and commit the updated `index.html`. See [Web Lite browser support](./web-lite-browser-support.md) for the support contract.

## Windows desktop builds

```bash
npm run desktop:pack
```

This command typechecks, builds Next.js, prepares the desktop distribution, and asks electron-builder for an inspectable `release/win-unpacked/` directory.

```bash
npm run desktop:build
```

This creates the x64 NSIS installer and portable EXE under `release/`. Intermediate outputs are:

- `.next/standalone/`: original Next.js standalone output.
- `dist-desktop/server/`: cleaned bundled local service.
- `dist-desktop/app/`: minimal Electron app and packaging manifest.
- `release/`: final or inspectable Windows artifacts.

Treat `dist-desktop/` and `release/` as generated output, not source. See the [desktop maintenance guide](./desktop.md) for architecture, runtime boundaries, and artifact acceptance.

## Common scripts

### Build and static checks

| Command | Purpose |
| --- | --- |
| `npm run clean:next` | Remove the `.next` cache |
| `npm run dev` / `dev:clean` | Start Web development, with optional cache cleanup |
| `npm run build` / `start` | Build and start production-mode Next.js |
| `npm run typecheck` | Check Web and Electron TypeScript |
| `npm run electron:typecheck` | Check only the Electron TypeScript project |
| `npm run lint` | Run ESLint with zero warnings allowed |

### Core, security, and stability

| Command | Purpose |
| --- | --- |
| `npm run core:test` | Main pure-function, layout, font, settings, parser, and UI contract regressions |
| `npm run p0:test` | Safe fetch, API boundary, transaction, and export P0 gates |
| `npm run stability:test` | Settings, lifecycle, localization, Electron static, and workflow regressions |
| `npm run coverage` | Enforce critical-module coverage thresholds |
| `npm run electron-runtime:coverage` | Enforce per-file coverage for Electron risk boundaries |
| `npm run security:test` | Test Safe Fetch and network security boundaries |
| `npm run request-boundary:test` | Test application API origin and format boundaries |
| `npm run transactions:test` | Test document, AI translation, and desktop cancellation transactions |
| `npm run export:test` / `export-readiness:test` | Test immutable export transactions and export gates |
| `npm run parse:test` | Test supported music-platform link parsing |
| `npm run music-search:normalize-test` | Test NetEase search-result normalization |
| `npm run music-search:test` | Run the live-network NetEase search test; it is not an offline deterministic gate |

### Visual, browser, and performance

| Command | Purpose |
| --- | --- |
| `npm run palette:test` | Test album-art palette extraction |
| `npm run color-field:test` | Test the spatial color field |
| `npm run background-composition:test` | Run the deterministic background composition matrix |
| `npm run background-composition:benchmark` | Run the large-canvas browser benchmark and diagnostics |
| `npm run render-boundaries:test` | Build and run production render-boundary regressions |
| `npm run deferred-surfaces:test` | Test recovery of deferred editor surfaces |
| `npm run a11y:test` | Run the axe accessibility gate |
| `npm run click-spark:test` | Test Click Spark animation boundaries |

### Desktop, assets, and release helpers

| Command | Purpose |
| --- | --- |
| `npm run desktop:interaction-test` | Packaged single-instance, startup-origin, settings, and import-history regressions |
| `npm run desktop:final-artifact-smoke` | Verify final installer and portable bytes |
| `npm run desktop:packaged-assets-test` | Verify packaged static assets and the runtime manifest |
| `npm run desktop:startup-test` / `desktop:startup-benchmark` | Test or measure packaged-server startup |
| `npm run desktop:size` | Audit desktop artifact size |
| `npm run examples:generate-palettes` | Regenerate example palettes from temporary development covers |
| `npm run readme:media` / `readme:media:check` | Generate or verify README screenshots and example cards |
| `npm run font-license:test` | Verify font and license distribution contracts |
| `npm run dependency-audit:gate` | Enforce the production dependency advisory policy |
| `npm run sbom:prepare` / `sbom:inspect -- <file>` | Prepare and inspect the release SBOM runtime view |

Additional diagnostics and focused regressions remain in `package.json`. Read the matching file under `scripts/` before invoking an unfamiliar command so you know whether it expects packaged artifacts, browsers, network access, or extra arguments.

## Commit and PR checklist

1. Keep the change focused; do not modify versions or release notes incidentally.
2. Run scope-appropriate checks and record expensive or platform-specific gates that were not run.
3. If shared code affects Web Lite, regenerate and commit `index.html`.
4. Check `git diff --check`, documentation links, generated files, and secrets.
5. In the PR body, state the change, verification results, and anything left for CI or Windows-only execution.
