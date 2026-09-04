import type { CardRatio, CardStyle } from "@/lib/types";
import { portraitLayoutConfig } from "@/lib/card-layout-config";

export const PRESET_CARD_SIZES: Record<Exclude<CardRatio, "custom">, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "21:9": { width: 2520, height: 1080 },
  "3:2": { width: 1800, height: 1200 }
};

export const AUTO_HEIGHT_MIN = 640;
export const AUTO_HEIGHT_MAX = 6400;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getCardSize(style: CardStyle) {
  if ((style.layoutMode ?? "portrait") === "landscape") {
    if (style.landscapePlan) return style.landscapePlan.canvas;
    // Temporary measurement canvas only; exports remain blocked until a plan settles.
    return PRESET_CARD_SIZES["16:9"];
  }

  if (style.ratio !== "custom") {
    if (style.ratio === "16:9" || style.ratio === "21:9" || style.ratio === "3:2") {
      return {
        width: clamp(Math.round(style.width), portraitLayoutConfig.canvas.minWidth, portraitLayoutConfig.canvas.maxWidth),
        height: clamp(Math.round(style.height), portraitLayoutConfig.canvas.minHeight, portraitLayoutConfig.canvas.maxHeight)
      };
    }

    return PRESET_CARD_SIZES[style.ratio];
  }

  return {
    width: clamp(Math.round(style.width), portraitLayoutConfig.canvas.minWidth, portraitLayoutConfig.canvas.maxWidth),
    height: clamp(
      Math.round(style.height),
      style.autoHeight ? AUTO_HEIGHT_MIN : portraitLayoutConfig.canvas.minHeight,
      style.autoHeight ? AUTO_HEIGHT_MAX : portraitLayoutConfig.canvas.maxHeight
    )
  };
}
