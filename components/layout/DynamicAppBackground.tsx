"use client";

import type { ExtractedPalette } from "@/lib/types";
import type { UserSettings } from "@/lib/settings/types";
import { resolveEffectiveUiThemeId } from "@/lib/settings/user-settings";
import {
  DEFAULT_PALETTE,
  mixColors,
  withAlpha
} from "@/lib/palette-background";

export function DynamicAppBackground({
  palette,
  settings
}: {
  palette?: ExtractedPalette;
  settings: UserSettings;
  imageUrl?: string;
}) {
  const activePalette = palette ?? DEFAULT_PALETTE;
  const isColorful = activePalette.kind === "colorful";
  const primarySource = isColorful ? activePalette.primary : activePalette.averageLuminance > 0.5 ? activePalette.light : activePalette.dark;
  const secondarySource = isColorful ? activePalette.secondary ?? activePalette.primary : activePalette.muted;
  const accentSource = isColorful ? activePalette.accent ?? secondarySource : activePalette.primary;
  const primary = mixColors(primarySource, "#080910", 0.52);
  const secondary = mixColors(secondarySource, "#080910", 0.58);
  const accent = mixColors(accentSource, "#080910", isColorful ? 0.48 : 0.66);
  const shapeOpacity = isColorful ? 1 : activePalette.kind === "neutral" ? 0.58 : 0.74;
  const effectiveTheme = resolveEffectiveUiThemeId(settings);
  const isAcrylicTheme = effectiveTheme === "dark-acrylic" || effectiveTheme === "light-acrylic";
  const isAlbumDynamic = effectiveTheme === "album-dynamic";
  const isDark = effectiveTheme === "dark";
  const isLight = effectiveTheme === "light";

  if (isAcrylicTheme) {
    const isLight = effectiveTheme === "light-acrylic";

    return (
      <div
        className="absolute inset-0 z-0 overflow-hidden"
        aria-hidden="true"
        style={{ background: "transparent" }}
      >
        <div
          className="absolute inset-0"
          style={{
          background: isLight
            ? "rgba(245, 248, 252, 0.055)"
            : "rgba(8, 12, 18, 0.105)"
          }}
        />
        <div
          className="absolute inset-0"
          style={{
          background: isLight
            ? "linear-gradient(135deg, rgba(255,255,255,0.065), rgba(255,255,255,0.012))"
            : "linear-gradient(135deg, rgba(255,255,255,0.038), rgba(255,255,255,0.008))"
          }}
        />
      </div>
    );
  }

  if (isDark || isLight) {
    return (
      <div
        className="dynamic-app-background absolute inset-0 z-0 overflow-hidden transition-colors duration-700"
        style={{ background: isLight ? "#FFFFFF" : "#08090C" }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="dynamic-app-background absolute inset-0 z-0 overflow-hidden bg-[#080910] transition-colors duration-700" aria-hidden="true">
      <div
        className="absolute inset-0 transition-colors duration-700"
        style={{
          opacity: isAlbumDynamic ? 1 : 0,
          background: `linear-gradient(135deg, ${mixColors(activePalette.dark, "#05060A", 0.58)}, ${mixColors(primary, "#05060A", 0.54)} 52%, #07080E)`
        }}
      />
      <div
        className="absolute -left-[18vw] -top-[20vh] h-[58vh] w-[62vw] rounded-full blur-[120px] transition-colors duration-700"
        style={{ background: withAlpha(primary, 0.5 * shapeOpacity), opacity: isAlbumDynamic ? 1 : 0 }}
      />
      <div
        className="absolute -right-[20vw] top-[6vh] h-[64vh] w-[66vw] rounded-full blur-[150px] transition-colors duration-700"
        style={{ background: withAlpha(secondary, 0.44 * shapeOpacity), opacity: isAlbumDynamic ? 1 : 0 }}
      />
      <div
        className="absolute bottom-[-26vh] left-[20vw] h-[60vh] w-[68vw] rounded-full blur-[170px] transition-colors duration-700"
        style={{ background: withAlpha(accent, 0.38 * shapeOpacity), opacity: isAlbumDynamic ? 1 : 0 }}
      />
      <div
        className="absolute inset-0 transition-colors duration-700"
        style={{ background: `rgba(0,0,0,${settings.appBackground.overlayOpacity})` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(255,255,255,0.08),transparent_25%,rgba(255,255,255,0.04)_48%,transparent_72%)]" />
    </div>
  );
}
