import assert from "node:assert/strict";
import {
  APP_PREFERENCES_SCHEMA_VERSION,
  compareAppPreferences,
  nextAppPreferencesRevision,
  selectNewerAppPreferences,
  type AppPreferencesRecord
} from "../lib/settings/app-preferences-reconciliation";
import { DEFAULT_USER_SETTINGS } from "../lib/settings/types";

// Revisions dominate timestamps; timestamps only break ties while the desktop
// copy remains the deterministic final fallback.
function record(revision: number, updatedAt: number, locale: AppPreferencesRecord["locale"]): AppPreferencesRecord {
  return {
    schemaVersion: APP_PREFERENCES_SCHEMA_VERSION,
    revision,
    updatedAt,
    locale,
    userSettings: structuredClone(DEFAULT_USER_SETTINGS)
  };
}

const jsonNewer = selectNewerAppPreferences(record(2, 20, "en"), record(3, 10, "ja"));
assert.equal(jsonNewer.source, "desktop");
assert.equal(jsonNewer.record?.locale, "ja");

const localNewer = selectNewerAppPreferences(record(4, 10, "fr"), record(3, 99, "en"));
assert.equal(localNewer.source, "local");
assert.equal(localNewer.record?.locale, "fr");

const timestampTieBreak = selectNewerAppPreferences(record(4, 101, "es"), record(4, 100, "en"));
assert.equal(timestampTieBreak.source, "local");
assert.equal(compareAppPreferences(timestampTieBreak.record!, record(4, 100, "en")), 1);

assert.equal(selectNewerAppPreferences(null, record(1, 1, "en")).source, "desktop");
assert.equal(selectNewerAppPreferences(record(1, 1, "en"), null).source, "local");
assert.equal(selectNewerAppPreferences(record(0, 0, "zh"), record(0, 0, "zh-TW")).source, "desktop");
assert.deepEqual(nextAppPreferencesRevision(record(7, 1000, "en"), 900), {
  revision: 8,
  updatedAt: 1001
});

console.log("app preference reconciliation tests passed");
