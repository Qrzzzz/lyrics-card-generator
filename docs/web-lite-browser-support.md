# Web Lite browser support

[Documentation index](./README.md) · [Development guide](./development.en.md)

This document separates the user-facing browser policy from the exact engines used by automated tests. Web Lite is the static artifact generated into `index.html`; it does not include the Next.js server or desktop-only capabilities.

## Support policy

| Browser family | Supported desktop versions | Release-blocking automation |
| --- | --- | --- |
| Google Chrome and Microsoft Edge | Current stable major and the immediately previous stable major | Full Playwright Chromium Web Lite suite |
| Mozilla Firefox | Current stable major, the immediately previous stable major, and current ESR | Focused Playwright Firefox critical-path smoke |
| Apple Safari on macOS | Current major and the immediately previous major supported by Apple | Focused Playwright WebKit critical-path smoke |

Mobile browsers and unlisted browser families are best effort. The responsive interface may work, but the project does not promise their layout, memory ceiling, download behavior, or release-blocking coverage.

## Automated proxy versus real browsers

`package-lock.json` pins Playwright `1.61.1`. At the current lockfile it supplies Chromium `149.0.7827.55`, Firefox `151.0`, and WebKit `26.5` to CI. These engines are reproducible test proxies, not claims that every vendor shell, enterprise policy, operating-system integration, or native save dialog is identical.

The support window is a policy. When browser vendors advance, update Playwright and validate the new engines instead of editing this document merely to mirror one pinned runtime number. Safari-specific acceptance still benefits from a real supported macOS/Safari check when behavior depends on the browser shell.

## Release gates

The full Chromium suite covers the broad Web Lite contract, including:

- responsive layout and editor/preview geometry;
- accessibility and keyboard behavior;
- production artifact startup and approved static resources;
- render boundaries, long canvases, and remote-cover races;
- PNG, WebP, and JPG signatures and decoded dimensions;
- PNG clipboard capture with the selected quality where the browser exposes image clipboard writes;
- performance and background-composition benchmarks where enabled.

Firefox and WebKit smoke cover the supported critical path:

- Pages artifact startup;
- lyric editing and live preview;
- both bundled Source Han font files;
- local cover selection through a blob URL;
- PNG export and a verified browser download.

A release is blocked when the required Chromium suite or either cross-browser smoke project fails. Failure classification must still distinguish a product regression from a missing browser runtime, CI service failure, or invalid test environment.

## Capability boundaries

Web Lite supports manual content editing, local cover selection, shared layout/style controls, live preview, browser-side PNG/WebP/JPG export, and PNG clipboard copy when `ClipboardItem` plus asynchronous clipboard image writes are available. Clipboard support also depends on a secure context, the active browser permission policy, and the operating-system clipboard; a denied or unsupported write reports an error without changing editor content. It deliberately has no `/api/` runtime, so server-backed music search, music-platform parsing, remote proxying, desktop secure storage, desktop import history, and AI translation are outside its contract.

Remote images used directly by a browser must permit CORS access. Browser extensions, private-mode storage restrictions, enterprise download policies, and exact native download prompts are outside the product support contract.

## Maintainer commands

```bash
npm run web-lite:build
npm run web-lite:check
npm run pages:prepare
npm run web-lite:smoke
npm run web-lite:cross-browser-smoke
npm run a11y:test
```

`web-lite:check` rebuilds in a temporary directory and fails if committed `index.html` is stale; it does not repair the artifact. Run `web-lite:build` explicitly when an update is intended.
