import { resolveReadableTextTokens } from "@/lib/color/contrast";
import type { UserSettings } from "@/lib/settings/types";
import { resolveEffectiveAppBackgroundColor } from "@/lib/settings/user-settings";
import { DEFAULT_PALETTE } from "@/lib/palette-background";
import type { AppState } from "@/lib/types";

type UseEditorThemeTokensInput = {
  userSettings: UserSettings;
  palette?: AppState["palette"];
};

export function useEditorThemeTokens({ userSettings, palette }: UseEditorThemeTokensInput) {
  const themeAccent = userSettings.uiTheme === "album-dynamic"
    ? palette?.primary ?? DEFAULT_PALETTE.primary
    : userSettings.uiTheme === "light-blue" ? "#2563EB"
    : userSettings.uiTheme === "dark-pink" ? "#EC4899"
    : userSettings.uiTheme === "light-acrylic" ? "#2563EB"
    : userSettings.uiTheme === "dark-acrylic" ? "#60A5FA"
    : userSettings.uiAccentColor;

  const uiBackgroundColor = resolveEffectiveAppBackgroundColor(userSettings, palette?.dark ?? "#080910");
  const effectiveTextColorMode = userSettings.uiTheme === "dark-acrylic"
    ? "light"
    : userSettings.uiTheme === "light-acrylic"
      ? "dark"
      : userSettings.uiTextColorMode;
  const preferredTextColor = effectiveTextColorMode === "light"
    ? "#FFFFFF"
    : effectiveTextColorMode === "dark"
      ? "#191612"
      : effectiveTextColorMode === "custom"
        ? userSettings.uiCustomTextColor
        : undefined;
  const uiTextTokens = resolveReadableTextTokens(uiBackgroundColor, preferredTextColor);
  const resolvedThemeTokens = userSettings.uiTheme === "dark-acrylic" || userSettings.uiTheme === "light-acrylic"
    ? {}
    : {
        "--app-text-primary": uiTextTokens.primary,
        "--app-fg": uiTextTokens.fg,
        "--app-muted": uiTextTokens.muted,
        "--app-subtle": uiTextTokens.subtle
      };
  const customThemeTokens = userSettings.uiTheme === "custom"
    ? uiTextTokens.fg === "25 22 18"
      ? {
          "--app-bg": uiBackgroundColor,
          "--panel-bg": "255 255 255 / 0.78",
          "--panel-border": "15 23 42 / 0.18",
          "--input-bg": "255 255 255 / 0.88",
          "--input-border": "15 23 42 / 0.2",
          "--button-bg": "255 255 255 / 0.72",
          "--button-bg-hover": "241 245 249 / 0.94"
        }
      : {
          "--app-bg": uiBackgroundColor,
          "--panel-bg": "5 8 14 / 0.68",
          "--panel-border": "255 255 255 / 0.16",
          "--input-bg": "5 8 14 / 0.72",
          "--input-border": "255 255 255 / 0.16",
          "--button-bg": "255 255 255 / 0.1",
          "--button-bg-hover": "255 255 255 / 0.16"
        }
    : {};

  return {
    themeAccent,
    uiBackgroundColor,
    uiTextTokens,
    resolvedThemeTokens,
    customThemeTokens
  };
}
