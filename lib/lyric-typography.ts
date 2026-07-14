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
