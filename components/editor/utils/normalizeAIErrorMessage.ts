import { getAIErrorMessage, parseSerializedAIError } from "@/lib/ai/error-copy";
import type { Locale } from "@/lib/types";

export function normalizeAIErrorMessage(error: unknown, locale: Locale, fallback?: string) {
  const parsed = parseSerializedAIError(error instanceof Error ? error.message : "");
  if (parsed.code === "unknown" && fallback) {
    return fallback;
  }
  return getAIErrorMessage(locale, parsed.code, parsed.diagnostic);
}
