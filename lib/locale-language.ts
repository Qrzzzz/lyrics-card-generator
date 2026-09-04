import type { Locale } from "@/lib/types";

export const LOCALE_BCP47: Record<Locale, string> = {
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  en: "en",
  fr: "fr",
  ja: "ja",
  es: "es"
};

export function documentLanguageForLocale(locale: Locale) {
  return LOCALE_BCP47[locale];
}

/** Match the first supported language, preserving the user's preference order. */
export function resolvePreferredLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    try {
      const locale = new Intl.Locale(language.trim().replaceAll("_", "-"));
      switch (locale.language) {
        case "zh":
          // An explicit script takes precedence over the regional format.
          return locale.script === "Hant" || (
            locale.script !== "Hans" && ["TW", "HK", "MO"].includes(locale.region ?? "")
          ) ? "zh-TW" : "zh";
        case "en":
        case "fr":
        case "ja":
        case "es":
          return locale.language;
      }
    } catch {
      // Empty or malformed entries must not hide a later supported language.
    }
  }
  return "en";
}

export function readBrowserPreferredLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return resolvePreferredLocale(
    navigator.languages?.length ? navigator.languages : [navigator.language]
  );
}
