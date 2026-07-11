import {
  DEFAULT_USER_SETTINGS,
  getExportPixelRatio,
  type ExportQualityId,
  type EffectiveUiThemeId,
  type UiAccentMode,
  type UiAccentPresetId,
  type UiThemeMode,
  type UserSettings
} from "@/lib/settings/types";
import { normalizeHexColor, UI_ACCENT_PRESETS } from "@/lib/settings/accent";

export const USER_SETTINGS_STORAGE_KEY = "lyric-card-generator-user-settings";

const THEME_MODES = new Set<UiThemeMode>(["album-dynamic", "dark", "light"]);
const ACCENT_MODES = new Set<UiAccentMode>(["album-dynamic", "preset", "custom"]);
const ACCENT_PRESETS = new Set<UiAccentPresetId>(["red", "orange", "yellow", "green", "blue", "purple"]);
const QUALITIES = new Set<ExportQualityId>(["low", "medium", "high"]);

type UserSettingsInput = Partial<UserSettings> & Record<string, unknown>;

function normalizeThemeMode(source: UserSettingsInput): UiThemeMode {
  if (THEME_MODES.has(source.uiThemeMode as UiThemeMode)) {
    return source.uiThemeMode as UiThemeMode;
  }

  if (source.uiTheme === "dark" || source.uiTheme === "dark-acrylic" || source.uiTheme === "dark-pink") {
    return "dark";
  }

  if (source.uiTheme === "light" || source.uiTheme === "light-acrylic" || source.uiTheme === "light-blue") {
    return "light";
  }

  return DEFAULT_USER_SETTINGS.uiThemeMode;
}

function normalizeAcrylicEnabled(source: UserSettingsInput, uiThemeMode: UiThemeMode): boolean {
  if (uiThemeMode === "album-dynamic") {
    return false;
  }

  if (typeof source.uiAcrylicEnabled === "boolean") {
    return source.uiAcrylicEnabled;
  }

  return source.uiTheme === "dark-acrylic" || source.uiTheme === "light-acrylic";
}

function normalizeAccentMode(source: UserSettingsInput, customAccentColor: string): UiAccentMode {
  if (ACCENT_MODES.has(source.uiAccentMode as UiAccentMode)) {
    return source.uiAccentMode as UiAccentMode;
  }

  const legacyAccentColor = normalizeHexColor(source.uiAccentColor, UI_ACCENT_PRESETS.purple);
  if (legacyAccentColor !== UI_ACCENT_PRESETS.purple && customAccentColor === legacyAccentColor) {
    return "custom";
  }

  return DEFAULT_USER_SETTINGS.uiAccentMode;
}

function normalizeAccentPreset(value: unknown): UiAccentPresetId {
  return ACCENT_PRESETS.has(value as UiAccentPresetId)
    ? value as UiAccentPresetId
    : DEFAULT_USER_SETTINGS.uiAccentPreset;
}

function normalizeExportQuality(value: unknown): ExportQualityId {
  if (value === "ultra") {
    return "high";
  }

  return QUALITIES.has(value as ExportQualityId)
    ? value as ExportQualityId
    : DEFAULT_USER_SETTINGS.defaultExportQuality;
}

export function normalizeUserSettings(input: unknown): UserSettings {
  const source = input && typeof input === "object" ? input as UserSettingsInput : {};
  const uiThemeMode = normalizeThemeMode(source);
  const customAccentColor = normalizeHexColor(
    source.uiCustomAccentColor ?? source.uiAccentColor,
    DEFAULT_USER_SETTINGS.uiCustomAccentColor
  );
  const quality = normalizeExportQuality(source.defaultExportQuality);

  return {
    version: 1,
    sparkCursorEnabled: typeof source.sparkCursorEnabled === "boolean" ? source.sparkCursorEnabled : true,
    reduceMotionEnabled: source.reduceMotionEnabled === true,
    uiThemeMode,
    uiAcrylicEnabled: normalizeAcrylicEnabled(source, uiThemeMode),
    uiFontFamily: typeof source.uiFontFamily === "string" ? source.uiFontFamily.slice(0, 160) : "",
    uiAccentMode: normalizeAccentMode(source, customAccentColor),
    uiAccentPreset: normalizeAccentPreset(source.uiAccentPreset),
    uiCustomAccentColor: customAccentColor,
    appBackground: { ...DEFAULT_USER_SETTINGS.appBackground, mode: "album-dynamic" },
    defaultShowGeneratedWatermark: source.defaultShowGeneratedWatermark === true,
    defaultShowSharedBy: source.defaultShowSharedBy === true,
    defaultSharedByText: typeof source.defaultSharedByText === "string"
      ? source.defaultSharedByText.slice(0, 120)
      : DEFAULT_USER_SETTINGS.defaultSharedByText,
    defaultExportQuality: quality,
    defaultExportPixelRatio: getExportPixelRatio(quality),
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

export function resolveEffectiveUiThemeId(settings: UserSettings): EffectiveUiThemeId {
  if (settings.uiThemeMode === "dark" && settings.uiAcrylicEnabled) return "dark-acrylic";
  if (settings.uiThemeMode === "light" && settings.uiAcrylicEnabled) return "light-acrylic";
  return settings.uiThemeMode;
}

export function resolveEffectiveAppBackgroundColor(settings: UserSettings, albumColor: string) {
  const effectiveTheme = resolveEffectiveUiThemeId(settings);
  if (effectiveTheme === "dark") return "#08090C";
  if (effectiveTheme === "light") return "#FFFFFF";
  if (effectiveTheme === "dark-acrylic") return "#141821";
  if (effectiveTheme === "light-acrylic") return "#F3F6FA";

  return albumColor;
}
