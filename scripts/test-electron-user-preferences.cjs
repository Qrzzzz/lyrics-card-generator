const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { normalizeStoredPreferences } = require("../electron/user-preferences");

const valid = normalizeStoredPreferences({
  locale: "zh-TW",
  userSettings: {
    firstLaunchLanguageSelected: true,
    reduceMotionEnabled: true,
    defaultShowGeneratedWatermark: true,
    defaultShowSharedBy: true,
    defaultSharedByText: "Shared by Test"
  }
});
assert.equal(valid.locale, "zh-TW");
assert.equal(valid.schemaVersion, 2);
assert.equal(valid.revision, 0);
assert.equal(valid.updatedAt, 0);
assert.equal(valid.userSettings.firstLaunchLanguageSelected, true);
assert.equal(valid.userSettings.reduceMotionEnabled, true);
assert.equal(valid.userSettings.defaultShowGeneratedWatermark, true);
assert.equal(valid.userSettings.defaultShowSharedBy, true);
assert.equal(valid.userSettings.defaultSharedByText, "Shared by Test");
assert.equal(normalizeStoredPreferences({ locale: "de", userSettings: {} }), null);
assert.equal(normalizeStoredPreferences({ locale: "en", userSettings: null }), null);

const mainSource = readFileSync(resolve("electron/main.js"), "utf8");
assert.match(mainSource, /let appPreferencesWriteQueue = Promise\.resolve\(\)/);
assert.match(mainSource, /await enqueueAppPreferencesWrite\(preferences\)/);
assert.match(mainSource, /appPreferencesWriteQueue[\s\S]*?\.catch\(\(\) => undefined\)[\s\S]*?\.then\(\(\) => writeAppPreferences\(preferences\)\)/);
assert.match(mainSource, /current\.revision > preferences\.revision/);
assert.match(mainSource, /fs\.rename\(temporary, target\)/);

console.log(JSON.stringify({ ok: true, preferenceTests: 12 }, null, 2));
