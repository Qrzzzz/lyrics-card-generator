import {
  DEFAULT_USER_SETTINGS,
  EXPORT_QUALITY_OPTIONS,
  type AppBackgroundMode,
  type ExportQualityId,
  type UiThemeId,
  type UserSettings
} from "@/lib/settings/types";

export const USER_SETTINGS_STORAGE_KEY = "lyric-card-generator-user-settings";

const THEMES = new Set<UiThemeId>(["album-dynamic", "light-blue", "dark-pink", "custom"]);
const BACKGROUNDS = new Set<AppBackgroundMode>([
  "album-dynamic", "solid", "image-stretch", "image-contain", "image-cover", "image-blur", "image-palette"
]);
const QUALITIES = new Set<ExportQualityId>(["low", "medium", "high", "ultra"]);
const TEXT_MODES = new Set<UserSettings["uiTextColorMode"]>(["auto", "light", "dark", "custom"]);

function color(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function finite(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function normalizeUserSettings(input: unknown): UserSettings {
  const source = input && typeof input === "object" ? input as Partial<UserSettings> : {};
  const background: Partial<UserSettings["appBackground"]> = source.appBackground && typeof source.appBackground === "object" ? source.appBackground : {};
  const quality = QUALITIES.has(source.defaultExportQuality as ExportQualityId)
    ? source.defaultExportQuality as ExportQualityId
    : DEFAULT_USER_SETTINGS.defaultExportQuality;
  const option = EXPORT_QUALITY_OPTIONS.find((item) => item.id === quality)!;

  return {
    version: 1,
    sparkCursorEnabled: typeof source.sparkCursorEnabled === "boolean" ? source.sparkCursorEnabled : true,
    uiTheme: THEMES.has(source.uiTheme as UiThemeId) ? source.uiTheme as UiThemeId : "album-dynamic",
    uiFontFamily: typeof source.uiFontFamily === "string" ? source.uiFontFamily.slice(0, 160) : "",
    uiAccentColor: color(source.uiAccentColor, DEFAULT_USER_SETTINGS.uiAccentColor),
    uiTextColorMode: TEXT_MODES.has(source.uiTextColorMode as UserSettings["uiTextColorMode"])
      ? source.uiTextColorMode as UserSettings["uiTextColorMode"] : "auto",
    uiCustomTextColor: color(source.uiCustomTextColor, DEFAULT_USER_SETTINGS.uiCustomTextColor),
    appBackground: {
      mode: BACKGROUNDS.has(background.mode as AppBackgroundMode) ? background.mode as AppBackgroundMode : "album-dynamic",
      imageId: typeof background.imageId === "string" ? background.imageId : undefined,
      imageUrl: typeof background.imageUrl === "string" ? background.imageUrl : undefined,
      solidColor: color(background.solidColor, DEFAULT_USER_SETTINGS.appBackground.solidColor),
      extractedColor: background.extractedColor ? color(background.extractedColor, "#7C3AED") : undefined,
      overlayOpacity: finite(background.overlayOpacity, DEFAULT_USER_SETTINGS.appBackground.overlayOpacity, 0, 0.9),
      blurAmount: finite(background.blurAmount, DEFAULT_USER_SETTINGS.appBackground.blurAmount, 0, 80)
    },
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
