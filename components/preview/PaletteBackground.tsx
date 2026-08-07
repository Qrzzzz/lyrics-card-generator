"use client";

import { BACKGROUND_GRID_SIZE_BY_DENSITY, resolveBackgroundGridDensity } from "@/lib/background-grid";
import {
  DEFAULT_PALETTE,
  mixColors,
  withAlpha
} from "@/lib/palette-background";
import type { BackgroundGridDensity, ExtractedPalette } from "@/lib/types";

export function PaletteBackground({
  palette,
  showFineGrid = false,
  fineGridDensity
}: {
  palette?: ExtractedPalette;
  showFineGrid?: boolean;
  fineGridDensity?: BackgroundGridDensity;
}) {
  const activePalette = palette ?? DEFAULT_PALETTE;
  const gridSize = BACKGROUND_GRID_SIZE_BY_DENSITY[resolveBackgroundGridDensity(fineGridDensity)];
  const isColorful = activePalette.kind === "colorful";
  const rawPrimary = activePalette.primary;
  const rawSecondary = activePalette.secondary ?? activePalette.muted ?? rawPrimary;
  const rawAccent = activePalette.accent ?? rawSecondary;
  // Neutral palettes use a luminance-appropriate base instead of inventing stronger chroma.
  const neutralBase = activePalette.averageLuminance > 0.5 ? activePalette.light : activePalette.dark;
  const primarySource = isColorful ? rawPrimary : neutralBase;
  const secondarySource = isColorful ? rawSecondary : activePalette.muted;
  const accentSource = isColorful ? rawAccent : rawPrimary;
  const primary = mixColors(primarySource, "#050508", 0.34);
  const secondary = mixColors(secondarySource, "#080910", 0.28);
  const accent = mixColors(accentSource, "#09070A", isColorful ? 0.18 : 0.46);
  const muted = mixColors(activePalette.muted, "#080910", 0.42);
  const baseGradient = `linear-gradient(140deg, ${mixColors(activePalette.dark, "#05060A", 0.46)}, ${mixColors(primary, "#06070C", 0.38)} 48%, ${mixColors(secondary, "#020306", 0.56)})`;
  const shapeOpacity = isColorful ? 1 : activePalette.kind === "neutral" ? 0.58 : 0.74;

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: baseGradient }} />
      <div
        className="absolute -left-[18%] -top-[14%] h-[58%] w-[66%] rounded-full blur-[86px]"
        style={{ background: withAlpha(primary, 0.82) }}
      />
      <div
        className="absolute -right-[24%] top-[8%] h-[62%] w-[72%] rounded-full blur-[104px]"
        style={{ background: withAlpha(secondary, 0.74) }}
      />
      <div
        className="absolute bottom-[-24%] left-[22%] h-[58%] w-[78%] rounded-full blur-[118px]"
        style={{ background: withAlpha(accent, 0.7) }}
      />
      <div
        className="absolute left-[2%] top-[38%] h-[38%] w-[46%] rounded-full blur-[100px]"
        style={{ background: withAlpha(muted, 0.5) }}
      />
      <svg className="absolute inset-0 h-full w-full blur-[28px]" style={{ opacity: 0.8 * shapeOpacity }} viewBox="0 0 1080 1350" preserveAspectRatio="none">
        <path
          d="M-60 236 C 252 108 324 462 548 442 C 784 420 806 108 1146 166 L1146 454 C 822 382 746 702 510 694 C 250 686 190 364 -60 518 Z"
          fill={withAlpha(accent, 0.38)}
        />
        <path
          d="M1120 918 C 842 792 724 1084 504 1048 C 284 1012 202 744 -74 834 L-74 1102 C 212 1018 328 1276 560 1252 C 794 1228 888 982 1120 1168 Z"
          fill={withAlpha(primary, 0.34)}
        />
        <path
          d="M-90 734 C 168 594 306 838 522 794 C 736 750 854 520 1160 612 L1160 784 C 840 716 752 1010 514 1000 C 294 990 152 754 -90 928 Z"
          fill={withAlpha(secondary, 0.32)}
        />
      </svg>
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.3) 48%, rgba(0,0,0,0.54))"
        }}
      />
      {showFineGrid ? (
        <div
          data-card-fine-grid="true"
          className="absolute inset-0 opacity-[0.1]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.34) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.34) 1px, transparent 1px)",
            backgroundSize: `${gridSize}px ${gridSize}px`
          }}
        />
      ) : null}
    </div>
  );
}
