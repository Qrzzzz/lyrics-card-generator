import type { AICustomPreset, AILocalePromptOverrides, AIPromptLibrary } from "@/lib/ai/types";
import type { Locale } from "@/lib/types";

export { normalizePromptLibrary, normalizeAISettings } from "@/shared/ai-settings";

export function getLocalePromptOverrides(library: AIPromptLibrary, locale: Locale): AILocalePromptOverrides {
  const overrides = library.localeOverrides[locale];
  return { formatRulesOverride: "", styleOverrides: overrides?.styleOverrides ?? [] };
}
export function setLocalePromptOverrides(library: AIPromptLibrary, locale: Locale, overrides: AILocalePromptOverrides): AIPromptLibrary {
  const localeOverrides = { ...library.localeOverrides };
  if (overrides.styleOverrides.length) localeOverrides[locale] = { ...overrides, formatRulesOverride: "" };
  else delete localeOverrides[locale];
  return { ...library, localeOverrides };
}

export function isValidCustomPreset(preset: Pick<AICustomPreset, "title" | "prompt">) {
  return Boolean(preset.title.trim() && preset.prompt.trim());
}
