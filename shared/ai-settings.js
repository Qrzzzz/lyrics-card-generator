const { normalizePromptLibrary } = require("./ai-prompt-settings");

const DEFAULT_AI_SETTINGS = {
  baseUrl: "https://api.openai.com/v1", model: "", temperature: 0.7,
  defaultStyle: "recommended", reasoningEnabled: false,
  promptLibrary: { localeOverrides: {}, hiddenStyleIds: [], customPresets: [] }
};
const TRANSLATION_STYLES = new Set(["lyrical", "faithful", "spoken", "imagistic", "restrained", "recommended"]);

/** @param {unknown} input @returns {import('./ai-settings-types').AISettings} */
function normalizeAISettings(input) {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? /** @type {Record<string, unknown>} */ (input) : {};
  const temperature = Number(source.temperature);
  const promptLibrary = normalizePromptLibrary(source.promptLibrary);
  const requestedDefault = typeof source.defaultStyle === "string" ? source.defaultStyle : "";
  const builtInAvailable = TRANSLATION_STYLES.has(requestedDefault)
    && (requestedDefault === "recommended" || !promptLibrary.hiddenStyleIds.some((id) => id === requestedDefault));
  const customAvailable = promptLibrary.customPresets.some((preset) => preset.id === requestedDefault);
  return {
    baseUrl: typeof source.baseUrl === "string" && source.baseUrl.trim() ? source.baseUrl.trim() : DEFAULT_AI_SETTINGS.baseUrl,
    model: typeof source.model === "string" ? source.model.trim() : "",
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : DEFAULT_AI_SETTINGS.temperature,
    defaultStyle: builtInAvailable || customAvailable ? requestedDefault : DEFAULT_AI_SETTINGS.defaultStyle,
    reasoningEnabled: Boolean(source.reasoningEnabled), promptLibrary
  };
}

module.exports = { DEFAULT_AI_SETTINGS, normalizeAISettings, normalizePromptLibrary };
