import assert from "node:assert/strict";
import { getContrastRatio, resolveReadableTextColor } from "../lib/color/contrast";
import { DEFAULT_USER_SETTINGS, EXPORT_QUALITY_OPTIONS } from "../lib/settings/types";
import { normalizeUserSettings } from "../lib/settings/user-settings";

const defaults = normalizeUserSettings(undefined);
assert.equal(defaults.uiTheme, DEFAULT_USER_SETTINGS.uiTheme);
assert.equal(defaults.appBackground.mode, DEFAULT_USER_SETTINGS.appBackground.mode);
assert.equal(defaults.defaultExportPixelRatio, DEFAULT_USER_SETTINGS.defaultExportPixelRatio);

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

console.log(JSON.stringify({ ok: true, settingsTests: 9 }, null, 2));
