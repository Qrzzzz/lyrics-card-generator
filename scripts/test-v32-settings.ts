import assert from "node:assert/strict";
import { clearLyricContent } from "../lib/clear-content";
import { getContrastRatio, resolveReadableTextColor, resolveReadableTextTokens } from "../lib/color/contrast";
import { DEFAULT_USER_SETTINGS, EXPORT_QUALITY_OPTIONS } from "../lib/settings/types";
import { shouldShowFirstLaunchLanguage } from "../lib/settings/app-preferences";
import { normalizeUserSettings, resolveEffectiveAppBackgroundColor } from "../lib/settings/user-settings";
import type { AppState } from "../lib/types";

const defaults = normalizeUserSettings(undefined);
assert.equal(defaults.uiTheme, DEFAULT_USER_SETTINGS.uiTheme);
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
assert.equal(migrated.defaultExportPixelRatio, 3);
assert.equal(migrated.appBackground.solidColor, DEFAULT_USER_SETTINGS.appBackground.solidColor);
assert.equal(migrated.appBackground.overlayOpacity, 0.9);
assert.equal(migrated.appBackground.blurAmount, 0);
assert.deepEqual(EXPORT_QUALITY_OPTIONS.map((item) => item.pixelRatio), [1, 1.4, 2, 3]);
assert.ok(getContrastRatio("#FFFFFF", "#191612") > 15);
assert.equal(resolveReadableTextColor("#FFFFFF"), "#191612");
assert.equal(resolveReadableTextTokens("#EAF6FF").primary, "#191612");
assert.equal(resolveReadableTextTokens("#08040A").primary, "#FFFFFF");

const custom = normalizeUserSettings({ uiTheme: "custom" });
assert.equal(custom.uiTheme, "custom");
const imageBackground = normalizeUserSettings({ appBackground: { mode: "image-cover", extractedColor: "#336699" } });
assert.equal(imageBackground.appBackground.extractedColor, "#336699");
assert.equal(resolveEffectiveAppBackgroundColor(imageBackground, "#080910"), "#336699");
assert.equal(defaults.appBackground.mode, "album-dynamic");
assert.equal(defaults.defaultExportPixelRatio, 2);

const settingsBeforeClear = structuredClone(custom);
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
assert.deepEqual(custom, settingsBeforeClear);

console.log(JSON.stringify({ ok: true, settingsTests: 24 }, null, 2));
