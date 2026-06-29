import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import packageJson from "../package.json";
import { messages } from "../lib/i18n";

const locales = ["zh-CN", "zh-TW", "en", "fr", "ja", "es"] as const;
const appLocales = ["zh", "zh-TW", "en", "fr", "ja", "es"] as const;

assert.equal(packageJson.version, "3.6.1");

const packageLock = JSON.parse(readFileSync(resolve("package-lock.json"), "utf8"));
assert.equal(packageLock.version, "3.6.1");
assert.equal(packageLock.packages[""].version, "3.6.1");

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

const readmes = ["README.md", "README.zh-TW.md", "README.en.md", "README.fr.md", "README.ja.md", "README.es.md"];
for (const file of readmes) {
  const source = readFileSync(resolve(file), "utf8");
  assert.match(source, /Lyrics Card Generator Setup 3\.6\.1\.exe/);
  assert.match(source, /Lyrics Card Generator-3\.6\.1-portable\.exe/);
  assert.match(source, /docs\/releases\/v3\.6\.1\./);
}

for (const locale of locales) {
  assert.ok(existsSync(resolve(`docs/releases/v3.6.1.${locale}.md`)), `release note ${locale}`);
}

const exportSource = readFileSync(resolve("lib/export-image.ts"), "utf8");
assert.doesNotMatch(exportSource, /desktop-titlebar|lyricsCardDesktop|setWindowMaterial/);

console.log(JSON.stringify({ ok: true, v361TitlebarReleaseTests: 36 }, null, 2));
