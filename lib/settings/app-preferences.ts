import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import type { Locale } from "@/lib/types";
import type { UserSettings } from "@/lib/settings/types";
import { loadUserSettings, normalizeUserSettings, saveUserSettings } from "@/lib/settings/user-settings";

export const LOCALE_STORAGE_KEY = "lyric-card-generator-locale";
export const SUPPORTED_LOCALES: Locale[] = ["zh", "zh-TW", "en", "fr", "ja", "es"];

export function isSupportedLocale(locale: string | null): locale is Locale {
  return Boolean(locale && SUPPORTED_LOCALES.includes(locale as Locale));
}

export function shouldShowFirstLaunchLanguage(locale: string | null, userSettings: UserSettings) {
  return !isSupportedLocale(locale) || userSettings.firstLaunchLanguageSelected !== true;
}

export async function loadAppPreferences(): Promise<{ locale: string | null; userSettings: UserSettings }> {
  const localLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  const localSettings = loadUserSettings();
  const desktop = getLyricsCardDesktopApi();
  if (!desktop) return { locale: localLocale, userSettings: localSettings };

  try {
    const stored = await desktop.loadAppPreferences();
    if (!stored) return { locale: localLocale, userSettings: localSettings };
    const userSettings = normalizeUserSettings(stored.userSettings);
    const locale = typeof stored.locale === "string" ? stored.locale : localLocale;
    if (locale) window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    saveUserSettings(userSettings);
    return { locale, userSettings };
  } catch {
    return { locale: localLocale, userSettings: localSettings };
  }
}

export async function saveAppPreferences(locale: Locale, userSettings: UserSettings) {
  const normalized = saveUserSettings(userSettings);
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  const desktop = getLyricsCardDesktopApi();
  if (desktop) {
    const desktopSettings = normalized.appBackground.imageId
      ? { ...normalized, appBackground: { ...normalized.appBackground, imageUrl: undefined } }
      : normalized;
    await desktop.saveAppPreferences({ locale, userSettings: desktopSettings });
  }
  return normalized;
}
