const assert = require("node:assert/strict");
const { normalizeStoredPreferences } = require("../electron/user-preferences");

const valid = normalizeStoredPreferences({ locale: "zh-TW", userSettings: { firstLaunchLanguageSelected: true } });
assert.equal(valid.locale, "zh-TW");
assert.equal(valid.userSettings.firstLaunchLanguageSelected, true);
assert.equal(normalizeStoredPreferences({ locale: "de", userSettings: {} }), null);
assert.equal(normalizeStoredPreferences({ locale: "en", userSettings: null }), null);

console.log(JSON.stringify({ ok: true, preferenceTests: 4 }, null, 2));
