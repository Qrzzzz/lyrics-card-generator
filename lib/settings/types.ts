import type { ImportHistoryLimit } from "@/lib/import-history";

export type UiThemeMode = "album-dynamic" | "dark" | "light";

export type EffectiveUiThemeId =
  | "album-dynamic"
  | "dark"
  | "light"
  | "dark-acrylic"
  | "light-acrylic";

export type UiAccentMode = "album-dynamic" | "preset" | "custom";

export type UiAccentPresetId = "red" | "orange" | "yellow" | "green" | "blue" | "purple";

export type ExportQualityId = "low" | "medium" | "high";

export type ExportFormatId = "png" | "webp" | "jpg";

export type UserSettings = {
  version: 1;
  sparkCursorEnabled: boolean;
  reduceMotionEnabled: boolean;
  uiThemeMode: UiThemeMode;
  uiAcrylicEnabled: boolean;
  uiFontFamily: string;
  uiAccentMode: UiAccentMode;
  uiAccentPreset: UiAccentPresetId;
  uiCustomAccentColor: string;
  defaultShowGeneratedWatermark: boolean;
  defaultShowSharedBy: boolean;
  defaultSharedByText: string;
  defaultExportFormat: ExportFormatId;
  defaultExportQuality: ExportQualityId;
  defaultExportPixelRatio: number;
  importHistoryLimit: ImportHistoryLimit;
  firstLaunchLanguageSelected: boolean;
};

export const EXPORT_QUALITY_OPTIONS = [
  { id: "low", pixelRatio: 1 },
  { id: "medium", pixelRatio: 1.4 },
  { id: "high", pixelRatio: 2 }
] as const;

export const EXPORT_FORMAT_OPTIONS = [
  { id: "png", extension: "png", mimeType: "image/png" },
  { id: "webp", extension: "webp", mimeType: "image/webp" },
  { id: "jpg", extension: "jpg", mimeType: "image/jpeg" }
] as const;

export function getExportPixelRatio(quality: ExportQualityId): number {
  return EXPORT_QUALITY_OPTIONS.find((option) => option.id === quality)?.pixelRatio ?? 2;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  version: 1,
  sparkCursorEnabled: true,
  reduceMotionEnabled: false,
  uiThemeMode: "album-dynamic",
  uiAcrylicEnabled: false,
  uiFontFamily: "",
  uiAccentMode: "album-dynamic",
  uiAccentPreset: "purple",
  uiCustomAccentColor: "#7C3AED",
  defaultShowGeneratedWatermark: false,
  defaultShowSharedBy: false,
  defaultSharedByText: "",
  defaultExportFormat: "png",
  defaultExportQuality: "high",
  defaultExportPixelRatio: 2,
  importHistoryLimit: 10,
  firstLaunchLanguageSelected: false
};
