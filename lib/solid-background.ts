import { rgbToOklab } from "@/lib/color/oklab";
import type { CardStyle, ExtractedPalette } from "@/lib/types";

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
    .filter((r) => r.meanAlpha > 0 && r.visibleShare >= 0.02 && /^#[\da-f]{6}$/i.test(r.color))
    .map((r) => ({ color: r.color.toUpperCase(), weight: r.visibleShare * (1 + Math.min(1, r.cells.reduce((sum, c) => sum + c.coverage, 0))) }))
    .sort((a, b) => b.weight - a.weight || a.color.localeCompare(b.color));
  const merged: typeof regions = [];
  for (const region of regions) {
    const c = lab(region.color);
    const near = merged.find((r) => { const d = lab(r.color); return Math.hypot(c.l - d.l, c.a - d.a, c.b - d.b) < 0.065; });
    if (near) near.weight += region.weight;
    else merged.push({ ...region });
  }
  merged.sort((a, b) => b.weight - a.weight || a.color.localeCompare(b.color));
  const colors = merged.slice(0, 6).map((r) => r.color);
  return colors.length ? { colors, source: "cover" } : { colors: [...SOLID_PRESETS], source: "preset" };
}
export function resolveSolidColor(style: CardStyle) {
  return style.solidColorSource === "user" ? normalizeSolidHex(style.solidColor) : solidCandidates(style.extractedPalette).colors[0];
}
export function resolveCardTextColor(style: CardStyle) {
  if (style.textColorMode === "custom") return style.customTextColor;
  if (style.textColorMode !== "auto" || style.backgroundMode !== "solid") return "#FFFFFF";
  const color = resolveSolidColor(style);
  const channels = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#FFFFFF";
}
