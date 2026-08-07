import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = [
  "components/editor/SettingsStepper.tsx",
  "components/settings/LanguageSettingsSection.tsx",
  "components/editor/SongLinkParser.tsx",
  "components/editor/LocalAudioParser.tsx",
  "components/editor/LyricsFetchPanel.tsx",
  "components/lyrics/AiTranslatePanel.tsx",
  "components/editor/font-scheme/FontSchemePanel.tsx",
  "components/settings/SettingsNavigation.tsx"
];
const forbidden = [/\btext-white(?:\/[^\s"']+)?/g, /\bbg-black\/20\b/g, /\bborder-white\/(?:10|12)\b/g];
const allowed = new Set([
  "components/editor/SettingsStepper.tsx:text-white",
  "components/editor/font-scheme/FontSchemePanel.tsx:text-white",
  "components/editor/font-scheme/FontSchemePanel.tsx:text-white/65",
  "components/editor/font-scheme/FontSchemePanel.tsx:border-white/10"
]);

// Hard-coded colors require an explicit allowlist entry documenting a deliberate
// contrast or content-rendering exception to the shared theme tokens.
const violations: string[] = [];
for (const file of files) {
  const source = readFileSync(resolve(file), "utf8");
  for (const pattern of forbidden) {
    for (const match of source.matchAll(pattern)) {
      const token = match[0];
      if (!allowed.has(`${file}:${token}`)) violations.push(`${file}:${token}`);
    }
  }
}

assert.deepEqual(violations, []);

const appearanceFiles = [
  "components/settings/SettingsSurface.tsx",
  "components/settings/AppearanceSettingsSection.tsx",
  "app/globals.css"
];
const forbiddenAppearanceStrings = [
  "light-blue",
  "dark-pink",
  "蓝白浅色",
  "黑粉深色",
  "自定义主题",
  "BackgroundSettingsSection",
  "copy.background",
  'id: "background"',
  'data-ui-theme="custom"',
  '--custom-app-bg'
];
const appearanceViolations: string[] = [];
for (const file of appearanceFiles) {
  const source = readFileSync(resolve(file), "utf8");
  for (const token of forbiddenAppearanceStrings) {
    if (source.includes(token)) appearanceViolations.push(`${file}:${token}`);
  }
}

const appearanceSource = readFileSync(resolve("components/settings/AppearanceSettingsSection.tsx"), "utf8");
assert.match(appearanceSource, /SegmentedControl<UiThemeMode>/);
assert.match(appearanceSource, /ToggleRow/);
for (const token of ['value: "album-dynamic"', 'value: "dark"', 'value: "light"']) {
  assert.ok(appearanceSource.includes(token), `missing theme option ${token}`);
}
assert.doesNotMatch(appearanceSource, /<option value=/);
assert.deepEqual(appearanceViolations, []);

console.log(JSON.stringify({ ok: true, scannedFiles: files.length + appearanceFiles.length }, null, 2));
