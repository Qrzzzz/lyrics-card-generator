import { DEFAULT_AI_SETTINGS, type AICustomPreset, type AILocalePromptOverrides, type AIPromptLibrary, type AISettings, type SaveAISettingsInput } from "@/lib/ai/types";
import { isEditableTranslationStyle, isTranslationStyle } from "@/lib/ai/styles";
import type { Locale } from "@/lib/types";

const CUSTOM_PRESET_ID = /^custom:[a-z0-9-]{1,64}$/i;
const LOCALES: Locale[] = ["zh", "zh-TW", "en", "fr", "ja", "es"];

export function normalizePromptLibrary(input: unknown): AIPromptLibrary {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const hiddenStyleIds = Array.from(new Set(
    Array.isArray(source.hiddenStyleIds) ? source.hiddenStyleIds.filter(isEditableTranslationStyle) : []
  ));
  const rawLocaleOverrides = source.localeOverrides && typeof source.localeOverrides === "object"
    ? source.localeOverrides as Partial<Record<Locale, unknown>>
    : {};
  const localeOverrides: AIPromptLibrary["localeOverrides"] = {};
  for (const locale of LOCALES) {
    const normalized = normalizeLocaleOverrides(rawLocaleOverrides[locale]);
    if (normalized.formatRulesOverride || normalized.styleOverrides.length) {
      localeOverrides[locale] = normalized;
    }
  }

  // Migrate the short-lived v4.6 development schema without leaking its text into every locale.
  if (!localeOverrides.zh && (source.formatRulesOverride || source.styleOverrides)) {
    const legacy = normalizeLocaleOverrides(source);
    if (legacy.formatRulesOverride || legacy.styleOverrides.length) localeOverrides.zh = legacy;
  }

  const normalizedCustom = (Array.isArray(source.customPresets) ? source.customPresets : [])
    .filter((item): item is AICustomPreset => Boolean(item && typeof item === "object" && typeof item.id === "string" && CUSTOM_PRESET_ID.test(item.id)))
    .map((item) => ({ id: item.id, title: cleanText(item.title, 60), prompt: cleanText(item.prompt, 4000) }))
    .filter(isValidCustomPreset);
  const customPresets = Array.from(new Map(normalizedCustom.map((item) => [item.id, item])).values()).slice(0, 2);

  return { localeOverrides, hiddenStyleIds, customPresets };
}

export function getLocalePromptOverrides(library: AIPromptLibrary, locale: Locale): AILocalePromptOverrides {
  return library.localeOverrides[locale] ?? { formatRulesOverride: "", styleOverrides: [] };
}

export function setLocalePromptOverrides(library: AIPromptLibrary, locale: Locale, overrides: AILocalePromptOverrides): AIPromptLibrary {
  const localeOverrides = { ...library.localeOverrides };
  if (overrides.formatRulesOverride.trim() || overrides.styleOverrides.length) localeOverrides[locale] = overrides;
  else delete localeOverrides[locale];
  return { ...library, localeOverrides };
}

export function isValidCustomPreset(preset: Pick<AICustomPreset, "title" | "prompt">) {
  return Boolean(preset.title.trim() && preset.prompt.trim());
}

export function normalizeAISettings(input: Partial<SaveAISettingsInput>): AISettings {
  const temperature = Number(input.temperature);
  const promptLibrary = normalizePromptLibrary(input.promptLibrary);
  const requestedDefault = typeof input.defaultStyle === "string" ? input.defaultStyle : "";
  const builtInAvailable = isTranslationStyle(requestedDefault)
    && (requestedDefault === "recommended" || !promptLibrary.hiddenStyleIds.includes(requestedDefault));
  const customAvailable = promptLibrary.customPresets.some((preset) => preset.id === requestedDefault);
  return {
    baseUrl: typeof input.baseUrl === "string" && input.baseUrl.trim() ? input.baseUrl.trim() : DEFAULT_AI_SETTINGS.baseUrl,
    model: typeof input.model === "string" ? input.model.trim() : "",
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : DEFAULT_AI_SETTINGS.temperature,
    defaultStyle: builtInAvailable || customAvailable ? requestedDefault : DEFAULT_AI_SETTINGS.defaultStyle,
    reasoningEnabled: Boolean(input.reasoningEnabled),
    promptLibrary
  };
}

function normalizeLocaleOverrides(input: unknown): AILocalePromptOverrides {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const styleOverrides = Array.from(new Map(
    (Array.isArray(source.styleOverrides) ? source.styleOverrides : [])
      .filter((item) => item && isEditableTranslationStyle(item.id))
      .map((item) => [item.id, {
        id: item.id,
        title: cleanText(item.title, 60),
        prompt: cleanText(item.prompt, 4000)
      }])
  ).values());
  return { formatRulesOverride: cleanText(source.formatRulesOverride, 6000), styleOverrides };
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
