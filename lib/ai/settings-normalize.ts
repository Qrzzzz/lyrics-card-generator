import { DEFAULT_AI_SETTINGS, type AIPromptLibrary, type AISettings, type SaveAISettingsInput } from "@/lib/ai/types";
import { isEditableTranslationStyle, isTranslationStyle } from "@/lib/ai/styles";

const CUSTOM_PRESET_ID = /^custom:[a-z0-9-]{1,64}$/i;

export function normalizePromptLibrary(input: unknown): AIPromptLibrary {
  const source = input && typeof input === "object" ? input as Partial<AIPromptLibrary> : {};
  const hiddenStyleIds = Array.from(new Set(
    Array.isArray(source.hiddenStyleIds) ? source.hiddenStyleIds.filter(isEditableTranslationStyle) : []
  ));
  const styleOverrides = Array.from(new Map(
    (Array.isArray(source.styleOverrides) ? source.styleOverrides : [])
      .filter((item) => item && isEditableTranslationStyle(item.id))
      .map((item) => [item.id, {
        id: item.id,
        title: cleanText(item.title, 60),
        prompt: cleanText(item.prompt, 4000)
      }])
  ).values());
  const customPresets = Array.from(new Map(
    (Array.isArray(source.customPresets) ? source.customPresets : [])
      .filter((item) => item && typeof item.id === "string" && CUSTOM_PRESET_ID.test(item.id))
      .slice(0, 2)
      .map((item) => [item.id, {
        id: item.id,
        title: cleanText(item.title, 60),
        prompt: cleanText(item.prompt, 4000)
      }])
  ).values());
  return {
    formatRulesOverride: cleanText(source.formatRulesOverride, 6000),
    styleOverrides,
    hiddenStyleIds,
    customPresets
  };
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

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
