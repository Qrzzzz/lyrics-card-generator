import { getLyricsCardDesktopApi, type AppPreferencesSaveOptions } from "@/lib/desktop-api";
import type { Locale } from "@/lib/types";
import type { UserSettings } from "@/lib/settings/types";
import { loadUserSettings, normalizeUserSettings, saveUserSettings } from "@/lib/settings/user-settings";
import {
  APP_PREFERENCES_SCHEMA_VERSION,
  nextAppPreferencesRevision,
  selectNewerAppPreferences,
  type AppPreferencesRecord
} from "@/lib/settings/app-preferences-reconciliation";

export const LOCALE_STORAGE_KEY = "lyric-card-generator-locale";
export const APP_PREFERENCES_STORAGE_KEY = "lyric-card-generator-app-preferences-v2";
export const SUPPORTED_LOCALES: Locale[] = ["zh", "zh-TW", "en", "fr", "ja", "es"];
export type AppPreferencesPersistenceOptions = AppPreferencesSaveOptions;

let appPreferencesSaveQueue = Promise.resolve();

export function isSupportedLocale(locale: string | null): locale is Locale {
  return Boolean(locale && SUPPORTED_LOCALES.includes(locale as Locale));
}

export function shouldShowFirstLaunchLanguage(locale: string | null, userSettings: UserSettings) {
  return !isSupportedLocale(locale) || userSettings.firstLaunchLanguageSelected !== true;
}

export async function loadAppPreferences(): Promise<AppPreferencesRecord> {
  const localLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  const localSettings = loadUserSettings();
  const local = readLocalAppPreferences(localLocale, localSettings);
  const desktop = getLyricsCardDesktopApi();
  if (!desktop) return ensureMigratedRecord(local);

  try {
    const stored = normalizeAppPreferencesRecord(await desktop.loadAppPreferences());
    const selected = selectNewerAppPreferences(local, stored);
    const record = ensureMigratedRecord(selected.record ?? local);
    writeLocalAppPreferences(record);
    if (!stored || selected.source === "local" || stored.revision === 0) {
      await desktop.saveAppPreferences(toDesktopRecord(record));
    }
    return record;
  } catch {
    const record = ensureMigratedRecord(local);
    writeLocalAppPreferences(record);
    return record;
  }
}

export function saveAppPreferences(
  locale: Locale,
  userSettings: UserSettings,
  options?: AppPreferencesPersistenceOptions
) {
  const operation = appPreferencesSaveQueue.then(() => persistAppPreferences(locale, userSettings, options));
  appPreferencesSaveQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function persistAppPreferences(
  locale: Locale,
  userSettings: UserSettings,
  options?: AppPreferencesPersistenceOptions
) {
  const normalized = normalizeUserSettings(userSettings);
  const current = readLocalAppPreferences(locale, normalized);
  const version = nextAppPreferencesRevision(current);
  const record: AppPreferencesRecord = {
    schemaVersion: APP_PREFERENCES_SCHEMA_VERSION,
    ...version,
    locale,
    userSettings: normalized
  };
  const desktop = getLyricsCardDesktopApi();
  if (desktop) {
    const saved = await desktop.saveAppPreferences(toDesktopRecord(record), options);
    if (!saved) throw new Error("Unable to save application preferences.");
    try {
      writeLocalAppPreferences(record);
    } catch {
      // Desktop JSON is authoritative; a renderer cache failure must not report
      // a committed history/preferences transaction as failed.
    }
  } else {
    writeLocalAppPreferences(record);
  }
  return record;
}

function readLocalAppPreferences(locale: string | null, userSettings: UserSettings): AppPreferencesRecord {
  try {
    const parsed = normalizeAppPreferencesRecord(JSON.parse(
      window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY) || "null"
    ));
    if (parsed) return parsed;
  } catch {
    window.localStorage.removeItem(APP_PREFERENCES_STORAGE_KEY);
  }

  return {
    schemaVersion: APP_PREFERENCES_SCHEMA_VERSION,
    revision: 0,
    updatedAt: 0,
    locale: isSupportedLocale(locale) ? locale : "zh",
    userSettings: normalizeUserSettings(userSettings)
  };
}

function normalizeAppPreferencesRecord(input: unknown): AppPreferencesRecord | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = input as Partial<AppPreferencesRecord>;
  const locale = typeof source.locale === "string" ? source.locale : null;
  if (!isSupportedLocale(locale)) return null;
  if (!source.userSettings || typeof source.userSettings !== "object") return null;
  return {
    schemaVersion: APP_PREFERENCES_SCHEMA_VERSION,
    revision: Number.isSafeInteger(source.revision) && Number(source.revision) >= 0 ? Number(source.revision) : 0,
    updatedAt: Number.isFinite(source.updatedAt) && Number(source.updatedAt) >= 0 ? Number(source.updatedAt) : 0,
    locale,
    userSettings: normalizeUserSettings(source.userSettings)
  };
}

function ensureMigratedRecord(record: AppPreferencesRecord): AppPreferencesRecord {
  if (record.revision > 0) return record;
  const version = nextAppPreferencesRevision(record);
  return { ...record, ...version };
}

function writeLocalAppPreferences(record: AppPreferencesRecord) {
  window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(record));
  window.localStorage.setItem(LOCALE_STORAGE_KEY, record.locale);
  saveUserSettings(record.userSettings);
}

function toDesktopRecord(record: AppPreferencesRecord): AppPreferencesRecord {
  const userSettings = record.userSettings.appBackground.imageId
    ? { ...record.userSettings, appBackground: { ...record.userSettings.appBackground, imageUrl: undefined } }
    : record.userSettings;
  return { ...record, userSettings };
}
