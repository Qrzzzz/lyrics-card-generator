import { resolveReadableTextTokens } from "@/lib/color/contrast";
import type { UserSettings } from "@/lib/settings/types";
import { resolveEffectiveAppBackgroundColor } from "@/lib/settings/user-settings";
import { DEFAULT_PALETTE } from "@/lib/palette-background";
import type { AppState } from "@/lib/types";

type ResolveEditorThemeTokensInput = {
  userSettings: UserSettings;
  palette?: AppState["palette"];
};

export function resolveEditorThemeTokens({ userSettings, palette }: ResolveEditorThemeTokensInput) {
  const themeAccent = palette?.primary ?? DEFAULT_PALETTE.primary;
  const uiBackgroundColor = resolveEffectiveAppBackgroundColor(userSettings, palette?.dark ?? "#080910");
  const preferredTextColor =
    userSettings.uiTheme === "light" || userSettings.uiTheme === "light-acrylic"
      ? "#191612"
      : userSettings.uiTheme === "dark" || userSettings.uiTheme === "dark-acrylic"
        ? "#FFFFFF"
        : undefined;
  const uiTextTokens = resolveReadableTextTokens(uiBackgroundColor, preferredTextColor);

  return {
    themeAccent,
    uiBackgroundColor,
    uiTextTokens,
    resolvedThemeTokens: {
      "--app-text-primary": uiTextTokens.primary,
      "--app-fg": uiTextTokens.fg,
      "--app-muted": uiTextTokens.muted,
      "--app-subtle": uiTextTokens.subtle
    },
    customThemeTokens: {}
  };
}
