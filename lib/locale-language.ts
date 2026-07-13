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
