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
assert.doesNotMatch(titlebarSource, /aria-label="(?:Minimize|Maximize|Close)"/);

const preloadSource = readFileSync(resolve("electron/preload.js"), "utf8");
assert.match(preloadSource, /onWindowStateChanged/);
assert.match(preloadSource, /lyrics-card:window-state-changed/);

const mainSource = readFileSync(resolve("electron/main.js"), "utf8");
assert.match(mainSource, /function emitWindowState/);
assert.match(mainSource, /lyrics-card:window-state-changed/);

const exportSource = readFileSync(resolve("lib/export-image.ts"), "utf8");
assert.doesNotMatch(exportSource, /desktop-titlebar|lyricsCardDesktop|setWindowMaterial/);

console.log(JSON.stringify({ ok: true, titlebarRegressionTests: 17 }, null, 2));
