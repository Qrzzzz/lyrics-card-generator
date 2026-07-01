import type { ExtractedPalette, FontPresetId, FontScheme } from "@/lib/types";

export const DEFAULT_FONT_SCHEME: FontScheme = {
  mode: "preset",
  presetId: "source-han-sans",
  cjkFontFamily: "Source Han Sans SC",
  latinFontFamily: "Source Han Sans SC"
};

export const FONT_SCHEME_PRESETS: Record<FontPresetId, FontScheme> = {
  "source-han-sans": DEFAULT_FONT_SCHEME,
  "source-han-serif": {
    mode: "preset",
    presetId: "source-han-serif",
    cjkFontFamily: "Source Han Serif SC",
    latinFontFamily: "Source Han Serif SC"
  }
};

export const FONT_PREVIEW_COLORS = ["#0F2D58", "#1E66B0", "#53A1DB", "#9FCFEE"] as const;

export const FONT_PREVIEW_PALETTE: ExtractedPalette = {
  colors: [...FONT_PREVIEW_COLORS],
  primary: FONT_PREVIEW_COLORS[0],
  secondary: FONT_PREVIEW_COLORS[1],
  accent: FONT_PREVIEW_COLORS[2],
  dark: FONT_PREVIEW_COLORS[3],
  light: FONT_PREVIEW_COLORS[1],
  muted: FONT_PREVIEW_COLORS[2],
  averageLuminance: 0.46,
  averageSaturation: 0.59,
  hueVariance: 0.008,
  isLightCover: false,
  kind: "colorful"
};

export const FONT_PANEL_PREVIEW_LYRIC = {
  lines: [
    {
      original: "共に歩んだ旅路を辿れば",
      romanized: "tomoni ayunda tabiji wo tadoreba",
      translation: "若循着你我曾并肩走过的旅途回望"
    },
    {
      original: "そこに君は居なくとも",
      romanized: "soko ni kimi wa inakutomo",
      translation: "即便那里已不见你的身影"
    },
    {
      original: "きっと見つけられる",
      romanized: "kitto mitsukerareru",
      translation: "我也一定能寻见你曾留下的痕迹"
    }
  ]
} as const;

export function identifyFontPreset(scheme: Pick<FontScheme, "cjkFontFamily" | "latinFontFamily">) {
  return (Object.entries(FONT_SCHEME_PRESETS) as Array<[FontPresetId, FontScheme]>).find(
    ([, preset]) =>
      preset.cjkFontFamily === scheme.cjkFontFamily && preset.latinFontFamily === scheme.latinFontFamily
  )?.[0];
}

export function normalizeFontScheme(scheme: FontScheme): FontScheme {
  const presetId = identifyFontPreset(scheme);

  if (presetId) {
    return { ...FONT_SCHEME_PRESETS[presetId] };
  }

  return {
    mode: "custom",
    cjkFontFamily: scheme.cjkFontFamily.trim() || DEFAULT_FONT_SCHEME.cjkFontFamily,
    latinFontFamily: scheme.latinFontFamily.trim() || DEFAULT_FONT_SCHEME.latinFontFamily
  };
}
