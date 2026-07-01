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
assert.match(globalsSource, /body\[data-window-maximized="true"\]\s+\.app-shell\[data-desktop-shell="true"\]/);
assert.match(globalsSource, /--segmented-active-translate/);

const dynamicBackgroundSource = readFileSync(resolve("components/layout/DynamicAppBackground.tsx"), "utf8");
assert.doesNotMatch(dynamicBackgroundSource, /className="[^"]*\bfixed\s+inset-0[^"]*"/);

console.log(JSON.stringify({ ok: true, titlebarRegressionTests: 30 }, null, 2));
