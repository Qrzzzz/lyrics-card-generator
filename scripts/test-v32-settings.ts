import assert from "node:assert/strict";
import { clearLyricContent } from "../lib/clear-content";
import { getContrastRatio, resolveReadableTextColor, resolveReadableTextTokens } from "../lib/color/contrast";
import { DEFAULT_USER_SETTINGS, EXPORT_QUALITY_OPTIONS } from "../lib/settings/types";
import { UI_ACCENT_PRESETS, resolveUiAccentColor } from "../lib/settings/accent";
import { shouldShowFirstLaunchLanguage } from "../lib/settings/app-preferences";
import {
  normalizeUserSettings,
  resolveEffectiveAppBackgroundColor,
  resolveEffectiveUiThemeId
} from "../lib/settings/user-settings";
import type { AppState } from "../lib/types";

const defaults = normalizeUserSettings(undefined);
assert.equal(defaults.uiThemeMode, DEFAULT_USER_SETTINGS.uiThemeMode);
assert.equal(defaults.uiAcrylicEnabled, false);
assert.equal(defaults.uiAccentMode, "album-dynamic");
assert.equal(resolveUiAccentColor({ settings: defaults, palette: { colors: [], primary: "#2255AA", dark: "#111827", light: "#FFFFFF", muted: "#64748B", averageLuminance: 0.2, averageSaturation: 0.6, hueVariance: 0.5, isLightCover: false, kind: "colorful" } }), "#2255AA");
assert.equal(defaults.appBackground.mode, DEFAULT_USER_SETTINGS.appBackground.mode);
assert.equal(defaults.defaultExportPixelRatio, DEFAULT_USER_SETTINGS.defaultExportPixelRatio);
assert.equal(shouldShowFirstLaunchLanguage(null, defaults), true);
assert.equal(shouldShowFirstLaunchLanguage("zh", defaults), true);
assert.equal(shouldShowFirstLaunchLanguage("zh", { ...defaults, firstLaunchLanguageSelected: true }), false);

const migrated = normalizeUserSettings({
  sparkCursorEnabled: false,
  uiTheme: "light-blue",
  defaultExportQuality: "ultra",
  defaultExportPixelRatio: 99,
  appBackground: { mode: "image-cover", solidColor: "invalid", overlayOpacity: 2, blurAmount: -4 }
});
assert.equal(migrated.sparkCursorEnabled, false);
assert.equal(migrated.uiThemeMode, "light");
assert.equal(migrated.defaultExportQuality, "high");
assert.equal(migrated.defaultExportPixelRatio, 2);
assert.equal(migrated.appBackground.mode, "album-dynamic");
assert.equal(migrated.appBackground.solidColor, DEFAULT_USER_SETTINGS.appBackground.solidColor);
assert.equal(migrated.appBackground.overlayOpacity, DEFAULT_USER_SETTINGS.appBackground.overlayOpacity);
assert.equal(migrated.appBackground.blurAmount, DEFAULT_USER_SETTINGS.appBackground.blurAmount);
assert.deepEqual(EXPORT_QUALITY_OPTIONS.map((item) => item.pixelRatio), [1, 1.4, 2]);
assert.ok(getContrastRatio("#FFFFFF", "#191612") > 15);
assert.equal(resolveReadableTextColor("#FFFFFF"), "#191612");
assert.equal(resolveReadableTextTokens("#FFFFFF").primary, "#191612");
assert.equal(resolveReadableTextTokens("#08090C").primary, "#FFFFFF");

const legacyCustom = normalizeUserSettings({ uiTheme: "custom" });
assert.equal(legacyCustom.uiThemeMode, "album-dynamic");
assert.equal(normalizeUserSettings({ uiTheme: "dark-pink" }).uiThemeMode, "dark");
assert.equal(normalizeUserSettings({ uiTheme: "dark" }).uiThemeMode, "dark");
assert.equal(normalizeUserSettings({ uiTheme: "light" }).uiThemeMode, "light");
assert.equal(resolveEffectiveUiThemeId(normalizeUserSettings({ uiTheme: "dark-acrylic" })), "dark-acrylic");
assert.equal(resolveEffectiveUiThemeId(normalizeUserSettings({ uiTheme: "light-acrylic" })), "light-acrylic");
assert.equal(resolveEffectiveUiThemeId(normalizeUserSettings({ uiThemeMode: "album-dynamic", uiAcrylicEnabled: true })), "album-dynamic");
assert.equal(resolveEffectiveAppBackgroundColor(normalizeUserSettings({ uiTheme: "dark" }), "#123456"), "#08090C");
assert.equal(resolveEffectiveAppBackgroundColor(normalizeUserSettings({ uiTheme: "light" }), "#123456"), "#FFFFFF");
assert.equal(resolveEffectiveAppBackgroundColor(normalizeUserSettings({ uiTheme: "dark-acrylic" }), "#080910"), "#141821");
assert.equal(resolveEffectiveAppBackgroundColor(normalizeUserSettings({ uiTheme: "light-acrylic" }), "#080910"), "#F3F6FA");
const legacyAccent = normalizeUserSettings({ uiAccentColor: "#123abc" });
assert.equal(legacyAccent.uiAccentMode, "custom");
assert.equal(legacyAccent.uiCustomAccentColor, "#123ABC");
assert.equal(resolveUiAccentColor({ settings: normalizeUserSettings({ uiAccentMode: "preset", uiAccentPreset: "red" }) }), UI_ACCENT_PRESETS.red);
const imageBackground = normalizeUserSettings({ appBackground: { mode: "image-cover", extractedColor: "#336699" } });
assert.equal(imageBackground.appBackground.mode, "album-dynamic");
assert.equal(imageBackground.appBackground.extractedColor, undefined);
assert.equal(resolveEffectiveAppBackgroundColor(imageBackground, "#080910"), "#080910");
assert.equal(defaults.appBackground.mode, "album-dynamic");
assert.equal(defaults.defaultExportPixelRatio, 2);

const settingsBeforeClear = structuredClone(legacyCustom);
const cleared = clearLyricContent({
  url: "https://example.com/song",
  song: { source: "apple", title: "Song", artist: "Artist", album: "Album", originalCoverUrl: "cover", coverUrl: "cover", proxiedCoverUrl: "cover", originalUrl: "url" },
  lyrics: "lyrics",
  translationText: "translation",
  translationEnabled: true,
  palette: undefined,
  paletteWarning: "warning",
  style: { translationEnabled: true, translationText: "translation" }
} as AppState);
assert.equal(cleared.url, "");
assert.equal(cleared.song.title, "");
assert.equal(cleared.lyrics, "");
assert.equal(cleared.translationText, "");
assert.deepEqual(legacyCustom, settingsBeforeClear);

console.log(JSON.stringify({ ok: true, settingsTests: 34 }, null, 2));
