import assert from "node:assert/strict";
import { AITranslationError, validateConfiguredSettings } from "../lib/ai/client";
import { getAIErrorMessage, parseSerializedAIError, type AIErrorCode } from "../lib/ai/error-copy";
import { DEFAULT_AI_SETTINGS } from "../lib/ai/types";
import type { Locale } from "../lib/types";

const locales: Locale[] = ["zh", "zh-TW", "en", "fr", "ja", "es"];
const codes: AIErrorCode[] = [
  "missing_api_key", "missing_model", "missing_base_url", "invalid_base_url", "insecure_base_url", "invalid_request",
  "empty_prompt", "network", "timeout", "provider_error", "empty_stream", "invalid_response",
  "empty_response", "cancelled", "request_failed", "unknown"
];
for (const locale of locales) {
  for (const code of codes) {
    assert.ok(getAIErrorMessage(locale, code).trim(), `${locale} ${code}`);
  }
}

const parsed = parseSerializedAIError(
  "Error invoking remote method 'lyrics-card:ai-translate': Error: AI_ERROR:provider_error:quota exhausted"
);
assert.deepEqual(parsed, { code: "provider_error", diagnostic: "quota exhausted" });
assert.equal(getAIErrorMessage("fr", parsed.code, parsed.diagnostic), "Le fournisseur d’IA a renvoyé une erreur. (quota exhausted)");

assert.throws(
  () => validateConfiguredSettings({ ...DEFAULT_AI_SETTINGS, hasApiKey: false }),
  (error: unknown) => error instanceof AITranslationError && error.code === "missing_api_key"
);
assert.equal(new AITranslationError("", "network").message, "AI_ERROR:network");
assert.match(getAIErrorMessage("en", "insecure_base_url"), /HTTPS.*localhost.*loopback/i);

console.log("AI error localization tests passed");
