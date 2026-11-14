import { rgbToOklab } from "@/lib/color/oklab";
import type { CardStyle, ExtractedPalette } from "@/lib/types";
import { relativeLuminance } from "@/lib/palette-background";
import { createColorFieldPlan, sampleColorField } from "@/lib/spatial-color-field";

export const SOLID_PRESETS = ["#202124", "#F2F0EB", "#777777", "#FFFFFF"];
export function normalizeSolidHex(value: string | undefined) {
  if (!value || !/^#[\da-f]{6}$/i.test(value)) return SOLID_PRESETS[0];
  return value.toUpperCase();
}
function lab(hex: string) {
  return rgbToOklab({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
}
/** Use real regions, not generated gradient roles. Coverage suppresses isolated noise. */
export function solidCandidates(palette?: ExtractedPalette): { colors: string[]; source: "cover" | "preset" } {
  const regions = (palette?.analysis?.regions ?? [])
    .filter((r) => r.meanAlpha > 0 && r.visibleShare > 0 && /^#[\da-f]{6}$/i.test(r.color))
    .map((r) => ({ color: r.color.toUpperCase(), weight: r.visibleShare }))
    .sort((a, b) => b.weight - a.weight || a.color.localeCompare(b.color));
  const merged: typeof regions = [];
  for (const region of regions) {
    const c = lab(region.color);
    const near = merged.find((r) => { const d = lab(r.color); return Math.hypot(c.l - d.l, c.a - d.a, c.b - d.b) < 0.065; });
    if (near) near.weight += region.weight;
    else merged.push({ ...region });
  }
  merged.sort((a, b) => b.weight - a.weight || a.color.localeCompare(b.color));
  // Apply the noise floor to the whole merged color, not its individual clusters.
  const colors = merged.filter((r) => r.weight >= 0.02).slice(0, 6).map((r) => r.color);
  return colors.length ? { colors, source: "cover" } : { colors: [...SOLID_PRESETS], source: "preset" };
}
export function resolveSolidColor(style: CardStyle) {
  return style.solidColorSource === "user" ? normalizeSolidHex(style.solidColor) : solidCandidates(style.extractedPalette).colors[0];
}
export function resolveCardTextColor(style: CardStyle, size = { width: 1080, height: 1350 }) {
  if (style.textColorMode === "custom") return style.customTextColor;
  if (style.textColorMode !== "auto") return "#FFFFFF";
  let luminances: number[];
  if (style.backgroundMode === "solid" || style.contentMode === "instrumental") {
    luminances = [relativeLuminance(resolveSolidColor(style))];
  } else {
    const plan = createColorFieldPlan({ ...size, palette: style.extractedPalette, layoutSeed: style.gradientLayoutSeed });
    // Evaluate the composed field across the content area; the primary accent
    // alone does not describe the background beneath the lyrics.
    luminances = Array.from({ length: 25 }, (_, index) => relativeLuminance(
      sampleColorField(plan, 0.1 + (index % 5) * 0.2, 0.1 + Math.floor(index / 5) * 0.2)
    ));
  }
  const blackContrast = (Math.min(...luminances) + 0.05) / 0.05;
  const whiteContrast = 1.05 / (Math.max(...luminances) + 0.05);
  return blackContrast >= whiteContrast ? "#000000" : "#FFFFFF";
}
