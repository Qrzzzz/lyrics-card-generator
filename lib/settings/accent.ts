import { DEFAULT_PALETTE } from "@/lib/palette-background";
import type { UserSettings } from "@/lib/settings/types";
import type { AppState } from "@/lib/types";

export const UI_ACCENT_PRESETS = {
  red: "#EF4444",
  orange: "#F97316",
  yellow: "#EAB308",
  green: "#22C55E",
  blue: "#3B82F6",
  purple: "#7C3AED"
} as const;

export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toUpperCase()}` : fallback;
}

export function resolveUiAccentColor(input: {
  settings: UserSettings;
  palette?: AppState["palette"];
}): string {
  if (input.settings.uiAccentMode === "preset") {
    return UI_ACCENT_PRESETS[input.settings.uiAccentPreset];
  }

  if (input.settings.uiAccentMode === "custom") {
    return normalizeHexColor(input.settings.uiCustomAccentColor, UI_ACCENT_PRESETS.purple);
  }

  return input.palette?.primary ?? DEFAULT_PALETTE.primary;
}
