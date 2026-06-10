import type { ContentMode } from "@/lib/types";

export type LandscapeTypographyParams = {
  width: number;
  height: number;
  lineCount: number;
  hasTranslation: boolean;
  contentMode: ContentMode;
  maxHeight?: number;
  lineHeight?: number;
};

export type LandscapeTypography = {
  lyricFontSize: number;
  translationFontSize: number;
  lyricLineGap: number;
  pairGap: number;
};

export type LandscapeHeightParams = {
  lineCount: number;
  hasTranslation: boolean;
  lyricFontSize: number;
  translationFontSize?: number;
  lineHeight: number;
};

export function getLandscapeTypography({
  width,
  height,
  lineCount,
  hasTranslation,
  contentMode,
  maxHeight = height * 0.44,
  lineHeight = 1.28
}: LandscapeTypographyParams): LandscapeTypography {
  if (contentMode === "instrumental") {
    return {
      lyricFontSize: 64,
      translationFontSize: 0,
      lyricLineGap: 0,
      pairGap: 0
    };
  }

  const activeLineCount = Math.max(1, lineCount);
  const canvasScale = Math.min(width / 1920, height / 1080);
  let lyricFontSize = activeLineCount <= 3 ? 66 : activeLineCount <= 6 ? 54 : activeLineCount <= 9 ? 44 : 36;

  if (hasTranslation) {
    lyricFontSize *= 0.88;
  }

  const estimatedHeight = estimateLandscapeLyricsHeight({
    lineCount: activeLineCount,
    hasTranslation,
    lyricFontSize,
    lineHeight
  });

  if (estimatedHeight > maxHeight) {
    lyricFontSize *= maxHeight / estimatedHeight;
  }

  lyricFontSize = clamp(Math.floor(lyricFontSize * canvasScale), 22, hasTranslation ? 58 : 68);
  const translationFontSize = hasTranslation ? clamp(Math.round(lyricFontSize * 0.5), 17, 32) : 0;

  return {
    lyricFontSize,
    translationFontSize,
    lyricLineGap: Math.round(lyricFontSize * (hasTranslation ? 0.16 : 0.2)),
    pairGap: Math.round(lyricFontSize * (hasTranslation ? 0.28 : 0.18))
  };
}

export function estimateLandscapeLyricsHeight({
  lineCount,
  hasTranslation,
  lyricFontSize,
  translationFontSize,
  lineHeight
}: LandscapeHeightParams) {
  const activeLineCount = Math.max(1, lineCount);
  const activeTranslationSize = hasTranslation ? translationFontSize ?? lyricFontSize * 0.5 : 0;
  const lyricLineHeight = lyricFontSize * lineHeight;
  const translationLineHeight = hasTranslation ? activeTranslationSize * 1.28 : 0;
  const lyricLineGap = hasTranslation ? lyricFontSize * 0.16 : 0;
  const pairGap = lyricFontSize * (hasTranslation ? 0.28 : 0.18);

  return (
    activeLineCount * (lyricLineHeight + translationLineHeight + lyricLineGap) +
    Math.max(0, activeLineCount - 1) * pairGap
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
