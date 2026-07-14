import { LIGHT_ACRYLIC_TEXT_TOKENS, resolveReadableTextTokens } from "@/lib/color/contrast";
import type { UserSettings } from "@/lib/settings/types";
import { resolveUiAccentColor } from "@/lib/settings/accent";
import { resolveEffectiveAppBackgroundColor, resolveEffectiveUiThemeId } from "@/lib/settings/user-settings";
import type { AppState } from "@/lib/types";

type ResolveEditorThemeTokensInput = {
  userSettings: UserSettings;
  palette?: AppState["palette"];
};

export function resolveEditorThemeTokens({ userSettings, palette }: ResolveEditorThemeTokensInput) {
  const themeAccent = resolveUiAccentColor({ settings: userSettings, palette });
  const effectiveTheme = resolveEffectiveUiThemeId(userSettings);
  const uiBackgroundColor = resolveEffectiveAppBackgroundColor(userSettings, palette?.dark ?? "#080910");
  const preferredTextColor =
    effectiveTheme === "light" || effectiveTheme === "light-acrylic"
      ? "#191612"
      : effectiveTheme === "dark" || effectiveTheme === "dark-acrylic"
        ? "#FFFFFF"
        : undefined;
  const uiTextTokens = effectiveTheme === "light-acrylic"
    ? LIGHT_ACRYLIC_TEXT_TOKENS
    : resolveReadableTextTokens(uiBackgroundColor, preferredTextColor);

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
