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

/** Fits lyric/translation pairs into the measured landscape lyrics region. */
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
  let lyricFontSize = activeLineCount <= 3 ? 66 : activeLineCount <= 6 ? 54 : 44;

  if (hasTranslation) {
    lyricFontSize *= 0.88;
  }

  // A translated row consumes less than two full lyric lines because its font
  // is smaller, but still needs an explicit inter-pair gap.
  const pairWeight = hasTranslation ? 1.55 : 1;
  const estimatedHeight = activeLineCount * lyricFontSize * lineHeight * pairWeight;

  if (estimatedHeight > maxHeight) {
    lyricFontSize *= maxHeight / estimatedHeight;
  }

  lyricFontSize = clamp(Math.round(lyricFontSize * canvasScale), 24, hasTranslation ? 58 : 68);
  const translationFontSize = hasTranslation ? clamp(Math.round(lyricFontSize * 0.5), 17, 32) : 0;

  return {
    lyricFontSize,
    translationFontSize,
    lyricLineGap: Math.round(lyricFontSize * (hasTranslation ? 0.16 : 0.2)),
    pairGap: Math.round(lyricFontSize * (hasTranslation ? 0.28 : 0.18))
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
