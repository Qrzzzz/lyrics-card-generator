import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { settingsCopy } from "../lib/settings/copy";
import type { Locale } from "../lib/types";

const lyricEditor = readFileSync(resolve("components/editor/LyricEditor.tsx"), "utf8");
const settingsSurface = readFileSync(resolve("components/settings/SettingsSurface.tsx"), "utf8");
const settingsNavigation = readFileSync(resolve("components/settings/SettingsNavigation.tsx"), "utf8");
const settingsWorkspace = readFileSync(resolve("components/settings/useSettingsWorkspace.ts"), "utf8");
const settingsLayout = readFileSync(resolve("components/settings/SettingsLayout.tsx"), "utf8");
const preferences = readFileSync(resolve("components/editor/hooks/useEditorPreferences.ts"), "utf8");
const editorHeader = readFileSync(resolve("components/editor/EditorHeader.tsx"), "utf8");
const globals = readFileSync(resolve("app/globals.css"), "utf8");

assert.match(lyricEditor, /type ActiveSurface = "editor" \| "examples" \| "settings"/);
assert.match(lyricEditor, /x: isSettingsSurfaceOpen \? "-100%" : "0%"/);
assert.match(lyricEditor, /onRequireSettings: \(\) => openSettings\("ai"\)/);
assert.match(lyricEditor, /settingsButtonRef\.current\?\.focus\(\)/);
assert.match(editorHeader, /ref=\{settingsButtonRef\}[\s\S]*data-testid="settings-button"[\s\S]*onClick=\{\(\) => onOpenSettings\(\)\}/);
assert.match(settingsSurface, /data-testid="settings-surface"/);
assert.match(settingsSurface, /closeButtonRef\.current\?\.focus\(\)/);
assert.match(settingsSurface, /inert=\{!isActive \? true : undefined\}/);
assert.doesNotMatch(settingsSurface, /aria-modal|MotionDialog|createPortal|bg-black\/40/);
assert.match(settingsNavigation, /settings-navigation-mobile/);
assert.match(settingsNavigation, /role="menu"/);
assert.match(settingsNavigation, /settings-navigation__copy/);
assert.match(globals, /@media \(min-width: 720px\)/);
assert.match(globals, /@media \(min-width: 1024px\)/);
assert.match(settingsWorkspace, /setTimeout\(\(\) => \{\s*void saveCurrentAISettings\(signature\);\s*\}, 700\)/);
assert.match(settingsWorkspace, /signature !== lastSavedAISettingsRef\.current/);
assert.match(settingsWorkspace, /removeBackgroundImage\(previousImageId\)/);
assert.match(settingsLayout, /function SettingsSectionHeader/);
assert.match(settingsLayout, /function SettingsGroup/);
assert.match(settingsLayout, /function SettingsRow/);
assert.doesNotMatch(preferences, /isSettingsOpen|openSettings|closeSettings/);

for (const locale of ["zh", "zh-TW", "en", "fr", "ja", "es"] satisfies Locale[]) {
  const copy = settingsCopy[locale];
  for (const key of ["generalDescription", "appearanceDescription", "exportDescription", "aiDescription", "aboutDescription"] as const) {
    assert.ok(copy[key].trim(), `${locale} ${key}`);
  }
}

console.log(JSON.stringify({ ok: true, settingsWingTests: 25 }, null, 2));
