import type { CardRatio, CardStyle, ContentMode, FrameVariant } from "@/lib/types";
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
  lyrics: string;
  translationText?: string;
  translationEnabled: boolean;
  translationScale: number;
  lyricFontSize: number;
  lineHeight: number;
  contentMode: ContentMode;
  showCover: boolean;
  showSongInfo: boolean;
  allowTwoLineTitle: boolean;
  showGeneratedWatermark: boolean;
  showPlatformBadge: boolean;
  showSharedBy: boolean;
  sharedByText?: string;
  frameStyleEnabled: boolean;
  frameVariant?: FrameVariant;
}) {
  const frameEnabled = params.frameStyleEnabled && params.frameVariant !== "fullBleed";
  const outerPaddingY = (frameEnabled ? 72 : 44) * 2;
  const innerPaddingY = (frameEnabled ? 54 : 18) * 2;
  const contentWidth = Math.max(320, params.width - (frameEnabled ? 72 : 44) * 2 - (frameEnabled ? 54 : 18) * 2);
  const headerHeight = estimateHeaderHeight(params);
  const mainPaddingY = params.contentMode === "lyrics" ? 80 : 0;
  const lyricBlockHeight =
    params.contentMode === "lyrics"
      ? estimateLyricBlockHeight({
          lyrics: params.lyrics,
          translationText: params.translationText,
          translationEnabled: params.translationEnabled,
          translationScale: params.translationScale,
          lyricFontSize: params.lyricFontSize,
          lineHeight: params.lineHeight,
          contentWidth
        })
      : 520;
  const footerReserve = estimateFooterReserve({
    showGeneratedWatermark: params.showGeneratedWatermark,
    showPlatformBadge: params.showPlatformBadge,
    showSharedBy: params.showSharedBy,
    sharedByText: params.sharedByText
  });
  const safety = params.contentMode === "lyrics" ? 48 : 80;
  const height = outerPaddingY + innerPaddingY + headerHeight + mainPaddingY + lyricBlockHeight + footerReserve + safety;

  return clamp(roundUpToStep(height, 20), 1080, portraitLayoutConfig.canvas.maxHeight);
}

function estimateHeaderHeight(params: {
  contentMode: ContentMode;
  showCover: boolean;
  showSongInfo: boolean;
  allowTwoLineTitle: boolean;
}) {
  if (params.contentMode === "instrumental" || (!params.showCover && !params.showSongInfo)) {
    return 0;
  }

  const coverHeight = params.showCover ? 174 : 0;
  const titleLines = params.allowTwoLineTitle ? 2 : 1;
  const songInfoHeight = params.showSongInfo ? 24 + 51 * 1.48 * titleLines + 16 + 35 * 1.5 : 0;

  return Math.max(coverHeight, songInfoHeight);
}

function estimateLyricBlockHeight(params: {
  lyrics: string;
  translationText?: string;
  translationEnabled: boolean;
  translationScale: number;
  lyricFontSize: number;
  lineHeight: number;
  contentWidth: number;
}) {
  const lyricLines = splitUsefulLines(params.lyrics);
  const translationLines = splitUsefulLines(params.translationText ?? "");
  const lines = lyricLines.length > 0 ? lyricLines : ["Type your lyrics here..."];
  const activeLyricSize = Math.max(34, Math.min(params.lyricFontSize, lines.length > 10 ? params.lyricFontSize - 6 : params.lyricFontSize));
  const activeTranslationSize = Math.round(activeLyricSize * params.translationScale);
  const pairMargin = activeLyricSize * (params.translationEnabled ? 0.42 : 0.18);

  return lines.reduce((total, line, index) => {
    const translation = params.translationEnabled ? translationLines[index] : "";
    const lyricRows = estimateWrappedRows(line || "\u00a0", activeLyricSize, params.contentWidth);
    const translationRows = translation ? estimateWrappedRows(translation, activeTranslationSize, params.contentWidth) : 0;
    const lyricHeight = lyricRows * activeLyricSize * params.lineHeight;
    const translationHeight = translationRows > 0 ? activeLyricSize * 0.28 + translationRows * activeTranslationSize * 1.32 : 0;
    const margin = index === lines.length - 1 ? 0 : pairMargin;

    return total + lyricHeight + translationHeight + margin;
  }, 0);
}

function estimateFooterReserve(params: {
  showGeneratedWatermark: boolean;
  showPlatformBadge: boolean;
  showSharedBy: boolean;
  sharedByText?: string;
}) {
  const hasSharedBy = params.showSharedBy && (params.sharedByText ?? "").trim().length > 0;
  const hasTopRow = params.showPlatformBadge || hasSharedBy;
  const topRowHeight = hasTopRow
    ? Math.max(params.showPlatformBadge ? 64 : 0, hasSharedBy ? estimateSharedByHeight(params.sharedByText ?? "") : 0)
    : 0;
  const generatedRowHeight = params.showGeneratedWatermark ? 28 : 0;
  const footerGap = hasTopRow && params.showGeneratedWatermark ? 20 : 0;

  return topRowHeight + generatedRowHeight + footerGap;
}

function estimateSharedByHeight(text: string) {
  const rows = estimateWrappedRows(text.trim(), 24, 520);

  return rows * 24 * 1.25;
}

function estimateWrappedRows(text: string, fontSize: number, maxWidth: number) {
  const width = estimateTextWidth(text, fontSize);

  return Math.max(1, Math.ceil(width / Math.max(fontSize, maxWidth)));
}

function estimateTextWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((total, char) => {
    if (/\s/.test(char)) {
      return total + fontSize * 0.33;
    }

    return total + fontSize * (isWideCharacter(char) ? 0.98 : 0.58);
  }, 0);
}

function isWideCharacter(char: string) {
  return /[\u1100-\u115f\u2e80-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/.test(char);
}

function splitUsefulLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => line.trim().length > 0 || (index > 0 && index < lines.length - 1));
}

function roundUpToStep(value: number, step: number) {
  return Math.ceil(value / step) * step;
}
