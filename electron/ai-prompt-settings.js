const EDITABLE_TRANSLATION_STYLES = new Set(["lyrical", "faithful", "spoken", "imagistic", "restrained"]);
const CUSTOM_PRESET_ID = /^custom:[a-z0-9-]{1,64}$/i;
const AI_PROMPT_LOCALES = ["zh", "zh-TW", "en", "fr", "ja", "es"];

function normalizePromptLibrary(input) {
  const source = input && typeof input === "object" ? input : {};
  const hiddenStyleIds = [...new Set(
    Array.isArray(source.hiddenStyleIds)
      ? source.hiddenStyleIds.filter((id) => EDITABLE_TRANSLATION_STYLES.has(id))
      : []
  )];
  const rawLocaleOverrides = source.localeOverrides && typeof source.localeOverrides === "object" ? source.localeOverrides : {};
  const localeOverrides = {};
  for (const locale of AI_PROMPT_LOCALES) {
    const normalized = normalizeLocalePromptOverrides(rawLocaleOverrides[locale]);
    if (normalized.formatRulesOverride || normalized.styleOverrides.length) localeOverrides[locale] = normalized;
  }
  if (!localeOverrides.zh && (source.formatRulesOverride || source.styleOverrides)) {
    const legacy = normalizeLocalePromptOverrides(source);
    if (legacy.formatRulesOverride || legacy.styleOverrides.length) localeOverrides.zh = legacy;
  }
  const custom = new Map();
  for (const item of Array.isArray(source.customPresets) ? source.customPresets : []) {
    if (!item || typeof item.id !== "string" || !CUSTOM_PRESET_ID.test(item.id)) continue;
    const normalized = { id: item.id, title: cleanText(item.title, 60), prompt: cleanText(item.prompt, 4000) };
    if (!normalized.title || !normalized.prompt) continue;
    custom.set(item.id, normalized);
  }
  return { localeOverrides, hiddenStyleIds, customPresets: [...custom.values()].slice(0, 2) };
}

function normalizeLocalePromptOverrides(input) {
  const source = input && typeof input === "object" ? input : {};
  const overrides = new Map();
  for (const item of Array.isArray(source.styleOverrides) ? source.styleOverrides : []) {
    if (!item || !EDITABLE_TRANSLATION_STYLES.has(item.id)) continue;
    overrides.set(item.id, { id: item.id, title: cleanText(item.title, 60), prompt: cleanText(item.prompt, 4000) });
  }
  return { formatRulesOverride: cleanText(source.formatRulesOverride, 6000), styleOverrides: [...overrides.values()] };
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

module.exports = { normalizePromptLibrary };
