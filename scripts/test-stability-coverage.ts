import assert from "node:assert/strict";
import {
  compareAppPreferences,
  nextAppPreferencesRevision,
  selectNewerAppPreferences,
  type AppPreferencesRecord
} from "../lib/settings/app-preferences-reconciliation";
import { getAIErrorMessage, parseSerializedAIError, type AIErrorCode } from "../lib/ai/error-copy";
import { DEFAULT_USER_SETTINGS } from "../lib/settings/types";
import type { Locale } from "../lib/types";

const makeRecord = (revision: number, updatedAt: number): AppPreferencesRecord => ({
  schemaVersion: 2,
  revision,
  updatedAt,
  locale: "en",
  userSettings: structuredClone(DEFAULT_USER_SETTINGS)
});
assert.equal(compareAppPreferences(makeRecord(2, 1), makeRecord(1, 99)) > 0, true);
assert.equal(compareAppPreferences(makeRecord(1, 2), makeRecord(1, 1)), 1);
assert.equal(selectNewerAppPreferences(null, makeRecord(1, 1)).source, "desktop");
assert.equal(selectNewerAppPreferences(makeRecord(1, 1), null).source, "local");
assert.equal(selectNewerAppPreferences(makeRecord(2, 1), makeRecord(1, 9)).source, "local");
assert.equal(selectNewerAppPreferences(makeRecord(1, 1), makeRecord(2, 0)).source, "desktop");
assert.deepEqual(nextAppPreferencesRevision(null, 10), { revision: 1, updatedAt: 10 });
assert.deepEqual(nextAppPreferencesRevision(makeRecord(4, 20), 10), { revision: 5, updatedAt: 21 });

const locales: Locale[] = ["zh", "zh-TW", "en", "fr", "ja", "es"];
const codes: AIErrorCode[] = ["missing_api_key", "missing_model", "missing_base_url", "invalid_base_url", "invalid_request", "empty_prompt", "network", "timeout", "provider_error", "empty_stream", "invalid_response", "empty_response", "cancelled", "request_failed", "unknown"];
for (const locale of locales) for (const code of codes) assert.ok(getAIErrorMessage(locale, code));
assert.match(getAIErrorMessage("en", "provider_error", "detail"), /detail/);
assert.equal(getAIErrorMessage("en", "network", "hidden detail").includes("hidden detail"), false);
assert.deepEqual(parseSerializedAIError("AI_ERROR:network"), { code: "network", diagnostic: undefined });
assert.deepEqual(parseSerializedAIError("Error: AI_ERROR:provider_error:detail"), { code: "provider_error", diagnostic: "detail" });
assert.deepEqual(parseSerializedAIError("legacy"), { code: "unknown", diagnostic: undefined });

console.log("stability coverage tests passed");
