import {
  DEFAULT_USER_SETTINGS,
  EXPORT_QUALITY_OPTIONS,
  type ExportQualityId,
  type UiThemeId,
  type UserSettings
} from "@/lib/settings/types";

export const USER_SETTINGS_STORAGE_KEY = "lyric-card-generator-user-settings";

const THEMES = new Set<UiThemeId>([
  "album-dynamic",
  "dark",
  "light",
  "dark-acrylic",
  "light-acrylic"
]);
const QUALITIES = new Set<ExportQualityId>(["low", "medium", "high", "ultra"]);
const TEXT_MODES = new Set<UserSettings["uiTextColorMode"]>(["auto", "light", "dark", "custom"]);

function color(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function normalizeTheme(value: unknown): UiThemeId {
  if (THEMES.has(value as UiThemeId)) return value as UiThemeId;

  if (value === "light-blue") return "light";
  if (value === "dark-pink") return "dark";
  if (value === "custom") return "album-dynamic";

  return DEFAULT_USER_SETTINGS.uiTheme;
}

export function normalizeUserSettings(input: unknown): UserSettings {
  const source = input && typeof input === "object" ? input as Partial<UserSettings> : {};
  const quality = QUALITIES.has(source.defaultExportQuality as ExportQualityId)
    ? source.defaultExportQuality as ExportQualityId
    : DEFAULT_USER_SETTINGS.defaultExportQuality;
  const option = EXPORT_QUALITY_OPTIONS.find((item) => item.id === quality)!;

  return {
    version: 1,
    sparkCursorEnabled: typeof source.sparkCursorEnabled === "boolean" ? source.sparkCursorEnabled : true,
    uiTheme: normalizeTheme(source.uiTheme),
    uiFontFamily: typeof source.uiFontFamily === "string" ? source.uiFontFamily.slice(0, 160) : "",
    uiAccentColor: color(source.uiAccentColor, DEFAULT_USER_SETTINGS.uiAccentColor),
    uiTextColorMode: TEXT_MODES.has(source.uiTextColorMode as UserSettings["uiTextColorMode"])
      ? source.uiTextColorMode as UserSettings["uiTextColorMode"] : "auto",
    uiCustomTextColor: color(source.uiCustomTextColor, DEFAULT_USER_SETTINGS.uiCustomTextColor),
    appBackground: { ...DEFAULT_USER_SETTINGS.appBackground, mode: "album-dynamic" },
    defaultExportQuality: quality,
    defaultExportPixelRatio: option.pixelRatio,
    firstLaunchLanguageSelected: source.firstLaunchLanguageSelected === true
  };
}

export function loadUserSettings(): UserSettings {
  if (typeof window === "undefined") return structuredClone(DEFAULT_USER_SETTINGS);
  try {
    return normalizeUserSettings(JSON.parse(window.localStorage.getItem(USER_SETTINGS_STORAGE_KEY) || "null"));
  } catch {
    return structuredClone(DEFAULT_USER_SETTINGS);
  }
}

export function saveUserSettings(settings: UserSettings): UserSettings {
  const normalized = normalizeUserSettings(settings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function mergeUserSettings(partial: Partial<UserSettings>): UserSettings {
  const current = loadUserSettings();
  return saveUserSettings({
    ...current,
    ...partial,
    appBackground: { ...current.appBackground, ...(partial.appBackground ?? {}) }
  });
}

export function resetUserSettings(): UserSettings {
  return saveUserSettings(structuredClone(DEFAULT_USER_SETTINGS));
}

export function resolveEffectiveAppBackgroundColor(settings: UserSettings, albumColor: string) {
  if (settings.uiTheme === "dark") return "#08090C";
  if (settings.uiTheme === "light") return "#FFFFFF";
  if (settings.uiTheme === "dark-acrylic") return "#141821";
  if (settings.uiTheme === "light-acrylic") return "#F3F6FA";

  return albumColor;
}
