import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { messages } from "../lib/i18n";

const appLocales = ["zh", "zh-TW", "en", "fr", "ja", "es"] as const;

for (const locale of appLocales) {
  assert.ok(messages[locale]["titleBar.minimize"], `${locale} minimize copy`);
  assert.ok(messages[locale]["titleBar.maximize"], `${locale} maximize copy`);
  assert.ok(messages[locale]["titleBar.restore"], `${locale} restore copy`);
  assert.ok(messages[locale]["titleBar.close"], `${locale} close copy`);
}

const titlebarSource = readFileSync(resolve("components/layout/DesktopTitleBar.tsx"), "utf8");
assert.match(titlebarSource, /onWindowStateChanged/);
assert.match(titlebarSource, /getWindowState/);
assert.match(titlebarSource, /titleBar\.restore/);
assert.match(titlebarSource, /traffic-light--close/);
assert.match(titlebarSource, /traffic-light--minimize/);
assert.match(titlebarSource, /traffic-light--maximize/);
assert.match(titlebarSource, /desktop-titlebar__traffic-lights[^"\n]*gap-0/);
assert.match(titlebarSource, /windowMaximized/);
assert.doesNotMatch(titlebarSource, /desktop-titlebar__corner-icon|app-icon\.png/);
assert.doesNotMatch(titlebarSource, /aria-label="(?:Minimize|Maximize|Close)"/);
assert.doesNotMatch(titlebarSource, /import\s+\{[^}]*\b(?:Minus|Square|Copy|X)\b[^}]*\}\s+from\s+"lucide-react"/);

const preloadSource = readFileSync(resolve("electron/preload.js"), "utf8");
assert.match(preloadSource, /onWindowStateChanged/);
assert.match(preloadSource, /lyrics-card:window-state-changed/);

const mainSource = readFileSync(resolve("electron/main.js"), "utf8");
assert.match(mainSource, /function emitWindowState/);
assert.match(mainSource, /lyrics-card:window-state-changed/);
assert.match(mainSource, /roundedCorners:\s*true/);
assert.match(mainSource, /thickFrame:\s*true/);
assert.match(mainSource, /transparent:\s*false/);
assert.doesNotMatch(mainSource, /setShape/);

const exportSource = readFileSync(resolve("lib/export-image.ts"), "utf8");
assert.doesNotMatch(exportSource, /desktop-titlebar|lyricsCardDesktop|setWindowMaterial/);

const globalsSource = readFileSync(resolve("app/globals.css"), "utf8");
assert.match(globalsSource, /\.traffic-light\b/);
assert.match(globalsSource, /\.desktop-titlebar__traffic-lights,[\s\S]*?\.traffic-light\s*\{[\s\S]*?-webkit-app-region: no-drag/);
assert.match(globalsSource, /\.traffic-light\s*\{[\s\S]*?width: 24px;[\s\S]*?height: 24px;/);
assert.match(globalsSource, /\.traffic-light\s*\{[\s\S]*?padding: 6px;[\s\S]*?background-clip: content-box;/);
assert.doesNotMatch(globalsSource, /\.traffic-light::before\s*\{/);
assert.doesNotMatch(globalsSource, /radial-gradient\(circle at 34% 26%/);
assert.doesNotMatch(globalsSource, /drop-shadow\([^\n]*--traffic-light-color/);
assert.match(globalsSource, /\.traffic-light:hover[\s\S]*?translateY\(-1px\) scale\(1\.11\)/);
assert.match(globalsSource, /\.traffic-light:active[\s\S]*?scale\(0\.9\)/);
assert.match(globalsSource, /\.traffic-light:focus-visible[\s\S]*?outline: 2px solid var\(--app-accent\)/);
assert.match(globalsSource, /body\[data-window-maximized="true"\]\s+\.app-shell\[data-desktop-shell="true"\]/);
assert.match(globalsSource, /--segmented-active-translate/);
assert.match(globalsSource, /--window-corner-radius: 8px/);
assert.match(globalsSource, /clip-path: inset\(0 round var\(--window-corner-radius\)\)/);

const dynamicBackgroundSource = readFileSync(resolve("components/layout/DynamicAppBackground.tsx"), "utf8");
assert.doesNotMatch(dynamicBackgroundSource, /className="[^"]*\bfixed\s+inset-0[^"]*"/);

console.log(JSON.stringify({ ok: true, titlebarRegressionTests: 37 }, null, 2));
