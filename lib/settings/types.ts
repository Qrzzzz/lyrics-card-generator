export type UiThemeId = "album-dynamic" | "light-blue" | "dark-pink" | "custom";

export type AppBackgroundMode =
  | "album-dynamic"
  | "solid"
  | "image-stretch"
  | "image-contain"
  | "image-cover"
  | "image-blur"
  | "image-palette";

export type ExportQualityId = "low" | "medium" | "high" | "ultra";

export type UserSettings = {
  version: 1;
  sparkCursorEnabled: boolean;
  uiTheme: UiThemeId;
  uiFontFamily: string;
  uiAccentColor: string;
  uiTextColorMode: "auto" | "light" | "dark" | "custom";
  uiCustomTextColor: string;
  appBackground: {
    mode: AppBackgroundMode;
    imageId?: string;
    imageUrl?: string;
    solidColor: string;
    extractedColor?: string;
    overlayOpacity: number;
    blurAmount: number;
  };
  defaultExportQuality: ExportQualityId;
  defaultExportPixelRatio: number;
  firstLaunchLanguageSelected: boolean;
};

export const EXPORT_QUALITY_OPTIONS = [
  { id: "low", pixelRatio: 1 },
  { id: "medium", pixelRatio: 1.4 },
  { id: "high", pixelRatio: 2 },
  { id: "ultra", pixelRatio: 3 }
] as const;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  version: 1,
  sparkCursorEnabled: true,
  uiTheme: "album-dynamic",
  uiFontFamily: "",
  uiAccentColor: "#7C3AED",
  uiTextColorMode: "auto",
  uiCustomTextColor: "#FFFFFF",
  appBackground: {
    mode: "album-dynamic",
    solidColor: "#080910",
    overlayOpacity: 0.46,
    blurAmount: 24
  },
  defaultExportQuality: "high",
  defaultExportPixelRatio: 2,
  firstLaunchLanguageSelected: false
};
