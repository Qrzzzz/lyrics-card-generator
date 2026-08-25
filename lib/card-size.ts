import type { CardRatio, CardStyle, ContentMode } from "@/lib/types";
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

export function estimateCardHeight(params: {
  width: number;
  lyrics: string;
  translationText?: string;
  translationEnabled: boolean;
  translationScale: number;
  lyricFontSize: number;
  lineHeight: number;
  contentMode: ContentMode;
  title: string;
  showCover: boolean;
  showSongInfo: boolean;
  hasAlbumName: boolean;
  allowMultiLineTitle: boolean;
  showGeneratedWatermark: boolean;
  showPlatformBadge: boolean;
  showSharedBy: boolean;
  sharedByText?: string;
}) {
  // This is a pre-layout estimate used to seed auto-height. Final export safety
  // still relies on measured DOM geometry rather than these character ratios.
  const lyricLines = params.lyrics.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const translationLines = params.translationEnabled
    ? (params.translationText ?? "").split(/\r?\n/).filter((line) => line.trim().length > 0)
    : [];
  const lyricLineCount = params.contentMode === "lyrics" ? Math.max(1, lyricLines.length + translationLines.length) : 5;
  const lyricCharacterCount =
    params.contentMode === "lyrics"
      ? Math.max(1, lyricLines.join("").length + translationLines.join("").length)
      : Math.max(1, (params.sharedByText ?? "Instrumental Track").length);
  const averageCharsPerLine = Math.max(12, Math.floor(params.width / (params.lyricFontSize * 0.62)));
  const wrappedLines = Math.max(
    lyricLineCount,
    Math.ceil(lyricCharacterCount / averageCharsPerLine)
  );
  const titleUnits = Array.from(params.title.trim() || "Untitled").reduce((total, character) => (
    total + (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Extended_Pictographic}/u.test(character) ? 1 : 0.58)
  ), 0);
  const songInfoWidth = params.showCover ? params.width * 0.55 : params.width * 0.82;
  const titleLines = params.showSongInfo && params.allowMultiLineTitle
    ? Math.max(1, Math.ceil((titleUnits * 51) / Math.max(1, songInfoWidth)))
    : 1;
  const titleOverflowHeight = (titleLines - 1) * 51 * 1.48;
  const topArea = params.showSongInfo || params.showCover
    ? (params.hasAlbumName ? 340 : 280) + titleOverflowHeight
    : 80;
  const hasFooter = params.showGeneratedWatermark || params.showPlatformBadge || params.showSharedBy;
  const bottomArea = hasFooter ? 120 : 40;
  const lyricArea = wrappedLines * params.lyricFontSize * params.lineHeight;
  const padding = 150;

  return clamp(Math.round(topArea + lyricArea + bottomArea + padding), 1080, AUTO_HEIGHT_MAX);
}
