# Web Lite browser support

Web Lite supports these desktop browser families:

| Browser family | Supported versions | Automated release gate |
| --- | --- | --- |
| Google Chrome and Microsoft Edge | Current stable major and the immediately previous stable major | Full Playwright Chromium Web Lite suite on every pull request and `main` push |
| Mozilla Firefox | Current stable major, the immediately previous stable major, and the current ESR | Minimal Playwright Firefox smoke on every pull request and `main` push |
| Apple Safari on macOS | Current major and the immediately previous major supported by Apple | Minimal Playwright WebKit smoke on every pull request and `main` push |

The exact automation runtime is locked by `package-lock.json`: Playwright `1.61.1` currently supplies Chromium `149.0.7827.55`, Firefox `151.0`, and WebKit `26.5` to CI. Playwright WebKit is a compatibility proxy for Safari, not a claim that it reproduces every Safari shell or operating-system download prompt. A release is blocked if the full Chromium suite or either Firefox/WebKit smoke project fails.

The Firefox/WebKit smoke deliberately covers only the supported critical path: production Pages artifact startup, lyric editing, live preview, both bundled Source Han font files, local cover selection through a blob URL, PNG export, and a verified browser download. The full Chromium suite remains the detailed gate for responsive geometry, accessibility, render boundaries, remote-cover races and CORS, WebP/JPG signatures, long canvases, and performance benchmarks.

PNG, WebP, and JPG are supported export formats in the desktop browsers above. PNG is the cross-browser smoke format; WebP and JPG encoding remain covered by the full Chromium suite. Remote covers must allow browser CORS access. Browser extensions, enterprise policies, private-mode storage restrictions, and exact native save-dialog behavior are outside the product support contract.

Mobile browsers and browser families not listed above are best effort and are not release-blocking. The responsive interface may work there, but this matrix does not promise mobile layout, memory limits, or download behavior.
