import assert from "node:assert/strict";
import { applyNewCardFooterDefaults, defaultState } from "../components/editor/editor-defaults";
import { clearLyricContent } from "../lib/clear-content";
import { getContrastRatio, resolveReadableTextColor, resolveReadableTextTokens } from "../lib/color/contrast";
import { DEFAULT_USER_SETTINGS, EXPORT_FORMAT_OPTIONS, EXPORT_QUALITY_OPTIONS } from "../lib/settings/types";
import { validateUiFontFamily } from "../lib/settings/font-family";
import { UI_ACCENT_PRESETS, resolveUiAccentColor } from "../lib/settings/accent";
import { hasAuthoredDocument } from "../lib/editor/document-transactions";
import {
  normalizeUserSettings,
  resetUserSettings,
  resolveEffectiveAppBackgroundColor,
  resolveEffectiveUiThemeId
} from "../lib/settings/user-settings";
import type { AppState } from "../lib/types";

// Normalization tests intentionally mix legacy, invalid, and current fields to
// prove migrations preserve valid preferences while clamping unsafe values.
const defaults = normalizeUserSettings(undefined);
assert.equal(defaults.uiThemeMode, DEFAULT_USER_SETTINGS.uiThemeMode);
assert.equal(defaults.uiAcrylicEnabled, false);
assert.equal(defaults.reduceMotionEnabled, false);
assert.equal(defaults.uiAccentMode, "album-dynamic");
assert.equal(resolveUiAccentColor({ settings: defaults, palette: { colors: [], primary: "#2255AA", dark: "#111827", light: "#FFFFFF", muted: "#64748B", averageLuminance: 0.2, averageSaturation: 0.6, hueVariance: 0.5, isLightCover: false, kind: "colorful" } }), "#2255AA");
assert.equal("appBackground" in defaults, false);
assert.equal(defaults.defaultExportPixelRatio, DEFAULT_USER_SETTINGS.defaultExportPixelRatio);
assert.equal(defaults.defaultExportFormat, "png");
assert.equal(defaults.defaultShowGeneratedWatermark, false);
assert.equal(defaults.defaultShowSharedBy, false);
assert.equal(defaults.defaultSharedByText, "");
assert.equal(defaults.importHistoryLimit, 10);

const migrated = normalizeUserSettings({
  sparkCursorEnabled: false,
  reduceMotionEnabled: true,
  uiTheme: "light-blue",
  defaultShowGeneratedWatermark: true,
  defaultShowSharedBy: true,
  defaultSharedByText: "Shared by Test",
  defaultExportFormat: "webp",
  defaultExportQuality: "ultra",
  defaultExportPixelRatio: 99,
  appBackground: { mode: "image-cover", solidColor: "invalid", overlayOpacity: 2, blurAmount: -4 }
});
assert.equal(migrated.sparkCursorEnabled, false);
assert.equal(migrated.reduceMotionEnabled, true);
assert.equal(migrated.uiThemeMode, "light");
assert.equal(migrated.defaultExportQuality, "high");
assert.equal(migrated.defaultExportFormat, "webp");
assert.equal(migrated.defaultExportPixelRatio, 2);
assert.equal(migrated.defaultShowGeneratedWatermark, true);
assert.equal(migrated.defaultShowSharedBy, true);
assert.equal(migrated.defaultSharedByText, "Shared by Test");
assert.equal(migrated.importHistoryLimit, 10, "legacy settings migrate without losing fields and receive the default history limit");
assert.equal("appBackground" in migrated, false, "legacy background settings are safely ignored");
assert.deepEqual(EXPORT_QUALITY_OPTIONS.map((item) => item.pixelRatio), [1, 1.4, 2]);
assert.deepEqual(EXPORT_FORMAT_OPTIONS.map((item) => item.id), ["png", "webp", "jpg"]);
assert.deepEqual(EXPORT_FORMAT_OPTIONS.map((item) => item.mimeType), ["image/png", "image/webp", "image/jpeg"]);
assert.equal(normalizeUserSettings({ defaultExportFormat: "jpg" }).defaultExportFormat, "jpg");
assert.equal(normalizeUserSettings({ defaultExportFormat: "svg" }).defaultExportFormat, "png");
assert.equal(normalizeUserSettings({ importHistoryLimit: 5 }).importHistoryLimit, 5);
assert.equal(normalizeUserSettings({ importHistoryLimit: 10 }).importHistoryLimit, 10);
assert.equal(normalizeUserSettings({ importHistoryLimit: "unlimited" }).importHistoryLimit, "unlimited");
assert.equal(normalizeUserSettings({ importHistoryLimit: "none" }).importHistoryLimit, "none");
assert.equal(normalizeUserSettings({ importHistoryLimit: 50 }).importHistoryLimit, 10);
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
assert.equal("appBackground" in imageBackground, false);
assert.equal(resolveEffectiveAppBackgroundColor(imageBackground, "#080910"), "#080910");
assert.equal(defaults.defaultExportPixelRatio, 2);

assert.deepEqual(validateUiFontFamily('"Source Han Sans SC", system-ui'), {
  valid: true,
  value: '"Source Han Sans SC", system-ui'
});
assert.equal(validateUiFontFamily("Segoe UI; color:red").valid, false);
assert.equal(validateUiFontFamily("url(https://example.com/font)").valid, false);

const scopedReset = resetUserSettings(normalizeUserSettings({
  uiThemeMode: "dark",
  defaultExportFormat: "webp",
  importHistoryLimit: "none",
  firstLaunchLanguageSelected: true
}), { persist: false });
assert.equal(scopedReset.uiThemeMode, DEFAULT_USER_SETTINGS.uiThemeMode);
assert.equal(scopedReset.defaultExportFormat, DEFAULT_USER_SETTINGS.defaultExportFormat);
assert.equal(scopedReset.importHistoryLimit, "none");
assert.equal(scopedReset.firstLaunchLanguageSelected, true);

const normalizedExportDefaults = normalizeUserSettings({
  reduceMotionEnabled: "yes",
  defaultShowGeneratedWatermark: 1,
  defaultShowSharedBy: "true",
  defaultSharedByText: "x".repeat(180)
});
assert.equal(normalizedExportDefaults.reduceMotionEnabled, false);
assert.equal(normalizedExportDefaults.defaultShowGeneratedWatermark, false);
assert.equal(normalizedExportDefaults.defaultShowSharedBy, false);
assert.equal(normalizedExportDefaults.defaultSharedByText.length, 120);

const newCardWithFooterDefaults = applyNewCardFooterDefaults(structuredClone(defaultState), {
  ...defaults,
  defaultShowGeneratedWatermark: true,
  defaultShowSharedBy: true,
  defaultSharedByText: "New card default"
});
assert.deepEqual({
  generated: newCardWithFooterDefaults.style.showGeneratedWatermark,
  legacyAlias: newCardWithFooterDefaults.style.showWatermark,
  sharedBy: newCardWithFooterDefaults.style.showSharedBy,
  text: newCardWithFooterDefaults.style.sharedByText
}, {
  generated: true,
  legacyAlias: true,
  sharedBy: true,
  text: "New card default"
});

const loadedDocument = structuredClone(defaultState);
loadedDocument.song.title = "Already loaded";
loadedDocument.style.showGeneratedWatermark = false;
loadedDocument.style.showWatermark = false;
loadedDocument.style.showSharedBy = true;
loadedDocument.style.sharedByText = "Document-owned footer";
const loadedSnapshot = structuredClone(loadedDocument);
const initializedDocument = hasAuthoredDocument(loadedDocument)
  ? loadedDocument
  : applyNewCardFooterDefaults(loadedDocument, {
    ...defaults,
    defaultShowGeneratedWatermark: true,
    defaultShowSharedBy: false,
    defaultSharedByText: "Changed preference"
  });
assert.deepEqual(
  initializedDocument,
  loadedSnapshot,
  "new-card footer preferences never overwrite an already loaded document"
);

const currentDocument = structuredClone(defaultState);
currentDocument.url = "https://example.com/song";
currentDocument.song = {
  source: "apple",
  title: "Song",
  artist: "Artist",
  album: "Album",
  originalCoverUrl: "cover",
  coverUrl: "cover",
  proxiedCoverUrl: "cover",
  originalUrl: "url"
};
currentDocument.style.layoutMode = "landscape";
currentDocument.style.font = "serif-heavy";
currentDocument.style.showGeneratedWatermark = true;
currentDocument.style.showWatermark = true;
currentDocument.style.showSharedBy = true;
currentDocument.style.sharedByText = "Keep after clear";
currentDocument.style.translationEnabled = true;
currentDocument.style.translationText = "translation";
currentDocument.paletteWarning = "warning";
const visualStateBeforeClear = {
  layoutMode: currentDocument.style.layoutMode,
  font: currentDocument.style.font,
  showGeneratedWatermark: currentDocument.style.showGeneratedWatermark,
  showWatermark: currentDocument.style.showWatermark,
  showSharedBy: currentDocument.style.showSharedBy,
  sharedByText: currentDocument.style.sharedByText
};
const cleared = clearLyricContent(currentDocument as AppState);
assert.equal(cleared.url, "");
assert.equal(cleared.song.title, "");
assert.equal(cleared.lyrics, "");
assert.equal(cleared.translationText, "");
assert.deepEqual({
  layoutMode: cleared.style.layoutMode,
  font: cleared.style.font,
  showGeneratedWatermark: cleared.style.showGeneratedWatermark,
  showWatermark: cleared.style.showWatermark,
  showSharedBy: cleared.style.showSharedBy,
  sharedByText: cleared.style.sharedByText
}, visualStateBeforeClear, "clearing content preserves the current card's visual and footer settings");

console.log(JSON.stringify({ ok: true, settingsTests: 44 }, null, 2));
