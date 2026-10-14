export const LYRIC_LINE_HEIGHT_MIN = 1.5;
export const LYRIC_LINE_HEIGHT_MAX = 2.1;
export const LYRIC_LINE_HEIGHT_STEP = 0.05;
export const DEFAULT_LYRIC_LINE_HEIGHT = 1.8;

export function normalizeLyricLineHeight(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_LYRIC_LINE_HEIGHT;
  }
  const clamped = Math.min(LYRIC_LINE_HEIGHT_MAX, Math.max(LYRIC_LINE_HEIGHT_MIN, value));
  const stepsFromMinimum = Math.round((clamped - LYRIC_LINE_HEIGHT_MIN) / LYRIC_LINE_HEIGHT_STEP);
  return Number((LYRIC_LINE_HEIGHT_MIN + stepsFromMinimum * LYRIC_LINE_HEIGHT_STEP).toFixed(2));
}

/** Keep authored lines at the selected height, with half the leading on soft wraps. */
export function getLyricLineSpacing(lineHeight: number, fontSize: number) {
  const authoredLineHeight = normalizeLyricLineHeight(lineHeight);
  const wrapLineHeight = 1 + (authoredLineHeight - 1) / 2;
  return {
    wrapLineHeight,
    // Padding preserves the single-line height and the existing row/paragraph gaps.
    edgePadding: fontSize * (authoredLineHeight - wrapLineHeight) / 2
  };
}
