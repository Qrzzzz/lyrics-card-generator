"use client";

import type { ExtractedPalette } from "@/lib/types";
import {
  DEFAULT_PALETTE,
  mixColors,
  withAlpha
} from "@/lib/palette-background";

export function DynamicAppBackground({
  palette
}: {
  palette?: ExtractedPalette;
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

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#080910] transition-colors duration-700" aria-hidden="true">
      <div
        className="absolute inset-0 transition-colors duration-700"
        style={{
          background: `linear-gradient(135deg, ${mixColors(activePalette.dark, "#05060A", 0.58)}, ${mixColors(primary, "#05060A", 0.54)} 52%, #07080E)`
        }}
      />
      <div
        className="absolute -left-[18vw] -top-[20vh] h-[58vh] w-[62vw] rounded-full blur-[120px] transition-colors duration-700"
        style={{ background: withAlpha(primary, 0.5 * shapeOpacity) }}
      />
      <div
        className="absolute -right-[20vw] top-[6vh] h-[64vh] w-[66vw] rounded-full blur-[150px] transition-colors duration-700"
        style={{ background: withAlpha(secondary, 0.44 * shapeOpacity) }}
      />
      <div
        className="absolute bottom-[-26vh] left-[20vw] h-[60vh] w-[68vw] rounded-full blur-[170px] transition-colors duration-700"
        style={{ background: withAlpha(accent, 0.38 * shapeOpacity) }}
      />
      <div
        className="absolute inset-0 transition-colors duration-700"
        style={{ background: "rgba(0,0,0,0.46)" }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(255,255,255,0.08),transparent_25%,rgba(255,255,255,0.04)_48%,transparent_72%)]" />
      <div className="noise-layer absolute inset-0 opacity-[0.12]" />
    </div>
  );
}
