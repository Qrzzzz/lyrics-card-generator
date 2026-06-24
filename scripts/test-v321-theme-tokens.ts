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
  "components/settings/SettingsTabs.tsx"
];
const forbidden = [/\btext-white(?:\/[^\s"']+)?/g, /\bbg-black\/20\b/g, /\bborder-white\/(?:10|12)\b/g];
const allowed = new Set([
  "components/editor/SettingsStepper.tsx:text-white",
  "components/editor/font-scheme/FontSchemePanel.tsx:text-white",
  "components/editor/font-scheme/FontSchemePanel.tsx:text-white/65",
  "components/editor/font-scheme/FontSchemePanel.tsx:border-white/10"
]);

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
console.log(JSON.stringify({ ok: true, scannedFiles: files.length }, null, 2));
