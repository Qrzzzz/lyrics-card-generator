import { getAIErrorMessage, parseSerializedAIError } from "@/lib/ai/error-copy";
import type { Locale } from "@/lib/types";

export function normalizeAIErrorMessage(error: unknown, locale: Locale) {
  const parsed = parseSerializedAIError(error instanceof Error ? error.message : "");
  return getAIErrorMessage(locale, parsed.code, parsed.diagnostic);
}
