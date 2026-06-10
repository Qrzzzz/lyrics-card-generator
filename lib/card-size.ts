import type { CardRatio, CardStyle } from "@/lib/types";
import { landscapeLayoutConfig, portraitLayoutConfig } from "@/lib/card-layout-config";

export const PRESET_CARD_SIZES: Record<Exclude<CardRatio, "custom">, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "21:9": { width: 2520, height: 1080 },
  "3:2": { width: 1800, height: 1200 }
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getCardSize(style: CardStyle) {
  if ((style.layoutMode ?? "portrait") === "landscape") {
    if (style.ratio !== "custom" && (style.ratio === "16:9" || style.ratio === "21:9" || style.ratio === "3:2")) {
      return PRESET_CARD_SIZES[style.ratio];
    }

    if (style.ratio !== "custom") {
      return PRESET_CARD_SIZES["16:9"];
    }

    return {
      width: clamp(Math.round(style.width), landscapeLayoutConfig.canvas.minWidth, landscapeLayoutConfig.canvas.maxWidth),
      height: clamp(Math.round(style.height), landscapeLayoutConfig.canvas.minHeight, landscapeLayoutConfig.canvas.maxHeight)
    };
  }

  if (style.ratio !== "custom") {
    if (style.ratio === "16:9" || style.ratio === "21:9" || style.ratio === "3:2") {
      return PRESET_CARD_SIZES["4:5"];
    }

    return PRESET_CARD_SIZES[style.ratio];
  }

  return {
    width: clamp(Math.round(style.width), portraitLayoutConfig.canvas.minWidth, portraitLayoutConfig.canvas.maxWidth),
    height: clamp(Math.round(style.height), portraitLayoutConfig.canvas.minHeight, portraitLayoutConfig.canvas.maxHeight)
  };
}

export function estimateCardHeight(params: {
  width: number;
  lyricLineCount: number;
  lyricCharacterCount: number;
  lyricFontSize: number;
  lineHeight: number;
  showSongInfo: boolean;
  showWatermark: boolean;
  showPlatformBadge: boolean;
  showSharedBy?: boolean;
}) {
  const averageCharsPerLine = Math.max(12, Math.floor(params.width / (params.lyricFontSize * 0.62)));
  const wrappedLines = Math.max(
    params.lyricLineCount,
    Math.ceil(params.lyricCharacterCount / averageCharsPerLine)
  );
  const topArea = params.showSongInfo ? 180 : 80;
  const bottomArea = params.showWatermark || params.showPlatformBadge || params.showSharedBy ? 120 : 40;
  const lyricArea = wrappedLines * params.lyricFontSize * params.lineHeight;
  const padding = 150;

  return clamp(Math.round(topArea + lyricArea + bottomArea + padding), 1080, 2400);
}
