import assert from "node:assert/strict";
import { AITranslationError, streamAITranslation, testAIConnection } from "../lib/ai/client";
import { AI_ERROR_CODES, getAIErrorMessage, parseSerializedAIError } from "../lib/ai/error-copy";
import { normalizeAIErrorMessage } from "../components/editor/utils/normalizeAIErrorMessage";
import type { Locale } from "../lib/types";

async function main() {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const locales: Locale[] = ["zh", "zh-TW", "en", "fr", "ja", "es"];
  const entries = [
    { channel: "ai-connection-test", run: () => testAIConnection(), success: true },
    { channel: "ai-translate", run: () => streamAITranslation({ prompt: "fixture", reasoning: false }), success: "translated" }
  ];
  let failure: unknown;
  let unsubscribed = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { lyricsCardDesktop: {
    startAIConnectionTest: async () => { if (failure) throw failure; return true; },
    cancelAIConnectionTest: async () => ({ cancelled: false, active: false }),
    startAITranslation: async () => { if (failure) throw failure; return "translated"; },
    cancelAITranslation: async () => ({ cancelled: false, active: false }),
    onAITranslationChunk: () => () => { unsubscribed += 1; }
  } } });
  try {
    for (const entry of entries) {
      for (const code of AI_ERROR_CODES.filter((value) => value !== "unknown")) {
        const diagnostic = code === "provider_error" ? "quota exhausted" : undefined;
        const serialized = `AI_ERROR:${code}${diagnostic ? `:${diagnostic}` : ""}`;
        const typed = new AITranslationError("fixture", code, diagnostic);
        for (const source of [new Error(serialized), new Error(`Error invoking remote method 'lyrics-card:${entry.channel}': Error: ${serialized}`), typed]) {
          failure = source;
          await assert.rejects(entry.run(), (error: unknown) => {
            assert.ok(error instanceof AITranslationError);
            assert.equal(error.code, code);
            assert.equal(error.diagnostic, diagnostic);
            if (source === typed) assert.equal(error, typed);
            for (const locale of locales) {
              assert.equal(normalizeAIErrorMessage(error, locale), getAIErrorMessage(locale, code, diagnostic));
            }
            return true;
          });
        }
      }
      for (const [source, code] of [
        [new Error("AI_ERROR:not_a_known_code:untrusted detail"), "request_failed"],
        [new Error("something failed"), "request_failed"],
        [new Error("fetch failed"), "network"],
        [new Error("timeout"), "timeout"],
        [new Error("AI_ERROR:provider_error"), "provider_error"],
        [{ code: "missing_api_key" }, "request_failed"],
        [new Error("AI_ERROR:missing_model:network timeout must not override this code"), "missing_model"]
      ] as const) {
        failure = source;
        await assert.rejects(entry.run(), (error: unknown) => error instanceof AITranslationError && error.code === code && error.diagnostic === undefined);
      }
      const unsafeDiagnostic = `Authorization: Bearer fake-ipc-token\r\nsk-fakeSecretOnly123 ${"x".repeat(600)}`;
      for (const source of [new Error(`AI_ERROR:provider_error:${unsafeDiagnostic}`), new AITranslationError("provider", "provider_error", unsafeDiagnostic)]) {
        failure = source;
        await assert.rejects(entry.run(), (error: unknown) => {
          assert.ok(error instanceof AITranslationError);
          assert.equal(error.code, "provider_error");
          assert.doesNotMatch(`${error.message} ${error.diagnostic}`, /fake-ipc-token|sk-fakeSecretOnly123|[\r\n]/);
          assert.ok((error.diagnostic?.length ?? 0) <= 300);
          return true;
        });
      }
      failure = new DOMException("aborted", "AbortError");
      await assert.rejects(entry.run(), (error: unknown) => error === failure);
      failure = undefined;
      assert.equal(await entry.run(), entry.success);
    }
    assert.ok(unsubscribed > 0);
    assert.deepEqual(parseSerializedAIError("AI_ERROR:not_a_known_code:unsafe"), { code: "unknown", diagnostic: undefined });
    console.log("Desktop AI error propagation passed: both client entries, all known codes, six locales, unknown errors, redaction and AbortError identity");
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
