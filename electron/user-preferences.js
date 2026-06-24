const SUPPORTED_LOCALES = new Set(["zh", "zh-TW", "en", "fr", "ja", "es"]);

function normalizeStoredPreferences(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (!SUPPORTED_LOCALES.has(input.locale)) return null;
  if (!input.userSettings || typeof input.userSettings !== "object" || Array.isArray(input.userSettings)) return null;
  return { locale: input.locale, userSettings: input.userSettings };
}

module.exports = { normalizeStoredPreferences };
