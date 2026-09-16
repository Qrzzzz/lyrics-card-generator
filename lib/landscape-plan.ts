import type {
  CardSizeSnapshot,
  LandscapeLayoutPlan,
  LandscapeLayoutSettings,
  LayoutRect
} from "@/lib/types";

export const LANDSCAPE_LYRICS_WIDTH_MIN = 520;
export const LANDSCAPE_LYRICS_WIDTH_MAX = 1280;
export const LANDSCAPE_LYRICS_WIDTH_STEP = 40;
export const LANDSCAPE_REQUESTED_HEIGHT_MIN = 720;
export const LANDSCAPE_REQUESTED_HEIGHT_MAX = 3600;

export const DEFAULT_LANDSCAPE_LAYOUT_SETTINGS: LandscapeLayoutSettings = {
  autoLyricsWidth: true,
  lyricsWidth: 880,
  autoHeight: true,
  requestedHeight: 1080
};

export type LandscapeMeasuredLine = {
  key: string;
  kind: "lyric" | "translation";
  visualLineCount: number;
  lastLineFill: number;
  averageLineFill: number;
  severeOrphan: boolean;
  horizontalOverflow: boolean;
};

export type LandscapeLyricsMeasurement = {
  lyricsWidth: number;
  naturalHeight: number;
  inkTop?: number;
  inkBottom?: number;
  canDistributeRows?: boolean;
  rowCount?: number;
  rightAccessoriesHeight?: number;
  rightAccessoriesInkTop?: number;
  lines: LandscapeMeasuredLine[];
};

export type LandscapeLeftMeasurement = {
  /** Natural artwork size at scale 1, already preserving its real ratio. */
  coverWidth: number;
  coverHeight: number;
  metadataWidth: number;
  metadataHeight: number;
  accessoriesWidth: number;
  accessoriesHeight: number;
  accessoriesInkTop?: number;
  metadataInkBottom?: number;
};

export type LandscapePlanInput = {
  measurementKey: string;
  settings: LandscapeLayoutSettings;
  lyricsCandidates: LandscapeLyricsMeasurement[];
  left: LandscapeLeftMeasurement;
  outerMargin?: number;
  columnGap?: number;
  coverMetadataGap?: number;
  minimumFlexibleGap?: number;
  minimumLeftScale?: number;
  maximumLeftScale?: number;
};

/**
 * Turns complete DOM measurements into one content-safe two-column plan.
 * No typography is altered here: insufficient space always grows the canvas.
 */
export function createLandscapeLayoutPlan(input: LandscapePlanInput): LandscapeLayoutPlan | null {
  const candidates = input.lyricsCandidates
    .filter(isUsableLyricsMeasurement)
    .sort((left, right) => left.lyricsWidth - right.lyricsWidth);
  if (candidates.length === 0) return null;

  const settings = normalizeLandscapeLayoutSettings(input.settings);
  const measuredCandidates = settings.autoLyricsWidth
    ? candidates
    : [nearestLyricsCandidate(candidates, settings.lyricsWidth)];
  const plans = measuredCandidates.map((candidate) => planCandidate(input, settings, candidate));
  plans.sort((left, right) => {
    const scoreDelta = left.score - right.score;
    // Near-equal results intentionally prefer the tighter lyrics column.
    if (Math.abs(scoreDelta) <= 24) return left.lyricsRect.width - right.lyricsRect.width;
    return scoreDelta;
  });
  return plans[0] ?? null;
}

export function getLandscapeLyricsWidthCandidates(settings: LandscapeLayoutSettings) {
  const normalized = normalizeLandscapeLayoutSettings(settings);
  if (!normalized.autoLyricsWidth) return [normalized.lyricsWidth];
  const widths: number[] = [];
  for (
    let width = LANDSCAPE_LYRICS_WIDTH_MIN;
    width <= LANDSCAPE_LYRICS_WIDTH_MAX;
    width += LANDSCAPE_LYRICS_WIDTH_STEP
  ) {
    widths.push(width);
  }
  return widths;
}

export function normalizeLandscapeLayoutSettings(
  value?: Partial<LandscapeLayoutSettings>,
  legacy?: CardSizeSnapshot
): LandscapeLayoutSettings {
  if (!value) return migrateLegacyLandscapeSize(legacy);
  return {
    autoLyricsWidth: value.autoLyricsWidth !== false,
    lyricsWidth: clampRounded(
      value.lyricsWidth ?? DEFAULT_LANDSCAPE_LAYOUT_SETTINGS.lyricsWidth,
      LANDSCAPE_LYRICS_WIDTH_MIN,
      LANDSCAPE_LYRICS_WIDTH_MAX
    ),
    autoHeight: value.autoHeight !== false,
    requestedHeight: clampRounded(
      value.requestedHeight ?? DEFAULT_LANDSCAPE_LAYOUT_SETTINGS.requestedHeight,
      LANDSCAPE_REQUESTED_HEIGHT_MIN,
      LANDSCAPE_REQUESTED_HEIGHT_MAX
    )
  };
}

/** Converts the former whole-canvas snapshot without preserving obsolete ratios. */
export function migrateLegacyLandscapeSize(legacy?: CardSizeSnapshot): LandscapeLayoutSettings {
  if (!legacy) return { ...DEFAULT_LANDSCAPE_LAYOUT_SETTINGS };
  const wasFreeSize = legacy.ratio === "custom";
  const inferredLyricsWidth = clampRounded(
    Math.round((legacy.width - 760) * 0.72),
    LANDSCAPE_LYRICS_WIDTH_MIN,
    LANDSCAPE_LYRICS_WIDTH_MAX
  );
  return {
    // Presets had no independent lyrics-width semantic; they migrate to the new default.
    autoLyricsWidth: wasFreeSize ? legacy.autoWidth !== false : true,
    lyricsWidth: wasFreeSize ? inferredLyricsWidth : DEFAULT_LANDSCAPE_LAYOUT_SETTINGS.lyricsWidth,
    autoHeight: wasFreeSize ? legacy.autoHeight !== false : true,
    requestedHeight: clampRounded(
      legacy.height,
      LANDSCAPE_REQUESTED_HEIGHT_MIN,
      LANDSCAPE_REQUESTED_HEIGHT_MAX
    )
  };
}

function planCandidate(
  input: LandscapePlanInput,
  settings: LandscapeLayoutSettings,
  lyrics: LandscapeLyricsMeasurement
): LandscapeLayoutPlan {
  const outerMargin = input.outerMargin ?? 84;
  const columnGap = input.columnGap ?? 84;
  const coverMetadataGap = input.coverMetadataGap ?? 40;
  const minimumFlexibleGap = input.minimumFlexibleGap ?? 52;
  const minimumScale = input.minimumLeftScale ?? 0.62;
  const maximumScale = input.maximumLeftScale ?? 1.28;
  const accessoriesHeight = Math.max(0, input.left.accessoriesHeight);
  const normalBaseHeight = input.left.coverHeight + coverMetadataGap + input.left.metadataHeight +
    (accessoriesHeight > 0 ? minimumFlexibleGap + accessoriesHeight : 0);
  // Classification uses content height, never the user's requested canvas height.
  const compact = lyrics.naturalHeight < normalBaseHeight * 0.78;
  const effectiveCoverGap = compact ? coverMetadataGap * 0.65 : coverMetadataGap;
  const effectiveFooterGap = compact ? minimumFlexibleGap * 0.65 : minimumFlexibleGap;
  const compactBaseHeight = input.left.coverHeight + effectiveCoverGap + input.left.metadataHeight +
    (accessoriesHeight > 0 ? effectiveFooterGap + accessoriesHeight : 0);
  const rightFooterHeight = lyrics.rightAccessoriesHeight ?? accessoriesHeight;
  const leftWithoutFooter = input.left.coverHeight + effectiveCoverGap + input.left.metadataHeight;
  // Require a material mismatch and room for the relocated footer. A slightly
  // shorter paragraph must not change the composition just because it wraps.
  const moveFooter = accessoriesHeight > 0 && compact &&
    lyrics.naturalHeight < compactBaseHeight * minimumScale * 0.72 &&
    lyrics.naturalHeight + effectiveFooterGap + rightFooterHeight <=
      (leftWithoutFooter - (input.left.metadataInkBottom ?? 0)) * minimumScale;
  const baseLeftHeight = moveFooter ? leftWithoutFooter : compactBaseHeight;
  const minimumLeftHeight = baseLeftHeight * minimumScale;
  const requestedInternalHeight = settings.autoHeight
    ? 0
    : Math.max(0, settings.requestedHeight - outerMargin * 2);
  let internalHeight = Math.max(lyrics.naturalHeight, requestedInternalHeight, minimumLeftHeight);
  const leftScale = clamp((compact ? lyrics.naturalHeight : internalHeight) / Math.max(1, baseLeftHeight), minimumScale, maximumScale);
  const scaledBaseLeftHeight = baseLeftHeight * leftScale;
  // Rounding and extreme measured metadata can still require a few extra pixels.
  if (scaledBaseLeftHeight > internalHeight) internalHeight = scaledBaseLeftHeight;

  const leftWidth = Math.max(
    input.left.coverWidth,
    input.left.metadataWidth,
    input.left.accessoriesWidth
  ) * leftScale;
  const canvasWidth = outerMargin * 2 + leftWidth + columnGap + lyrics.lyricsWidth;
  const canvasHeight = outerMargin * 2 + internalHeight;
  const leftX = outerMargin;
  const coverRect = rect(
    leftX + (leftWidth - input.left.coverWidth * leftScale) / 2,
    outerMargin,
    input.left.coverWidth * leftScale,
    input.left.coverHeight * leftScale
  );
  const metadataRect = rect(
    leftX,
    coverRect.y + coverRect.height + effectiveCoverGap * leftScale,
    leftWidth,
    input.left.metadataHeight * leftScale
  );
  const scaledAccessoriesHeight = moveFooter ? rightFooterHeight : accessoriesHeight * leftScale;
  const lyricsY = outerMargin;
  const lyricsX = outerMargin + leftWidth + columnGap;
  const metadataBottom = metadataRect.y + metadataRect.height - (input.left.metadataInkBottom ?? 0) * leftScale;
  const compositionHeight = compact ? Math.max(lyrics.naturalHeight, scaledBaseLeftHeight) : internalHeight;
  const footerBottom = moveFooter ? metadataBottom : outerMargin + compositionHeight;
  // Gentle distribution can absorb the minimum readable left-column size.
  // Extreme short/no-credit cases retain natural spacing and honest whitespace.
  const maximumExpansion = (lyrics.rowCount ?? 0) >= 3 ? 1.8 : 1.35;
  const distribute = lyrics.canDistributeRows && (!compact || compositionHeight <= lyrics.naturalHeight * maximumExpansion);
  const lyricsHeight = !moveFooter && distribute ? compositionHeight : lyrics.naturalHeight;
  const accessoriesRect = scaledAccessoriesHeight > 0
    ? rect(
        moveFooter ? lyricsX : coverRect.x,
        footerBottom - scaledAccessoriesHeight,
        moveFooter ? lyrics.lyricsWidth : coverRect.width,
        scaledAccessoriesHeight
      )
    : undefined;
  const topGroupBottom = metadataRect.y + metadataRect.height;
  const flexibleGap = accessoriesRect
    ? Math.max(0, accessoriesRect.y - (moveFooter ? lyricsY + lyricsHeight : topGroupBottom))
    : Math.max(0, outerMargin + internalHeight - topGroupBottom);
  const score = scoreLandscapeCandidate({
    lyrics,
    canvasWidth,
    canvasHeight,
    internalHeight,
    requestedInternalHeight
  });

  return {
    version: 1,
    measurementKey: input.measurementKey,
    canvas: roundedSize(canvasWidth, canvasHeight),
    safeRect: rect(outerMargin, outerMargin, canvasWidth - outerMargin * 2, internalHeight),
    leftColumnRect: rect(leftX, outerMargin, leftWidth, internalHeight),
    coverRect,
    metadataRect,
    accessoriesRect,
    accessoriesPlacement: moveFooter ? "right" : "left",
    accessoriesScale: moveFooter ? 1 : round(leftScale),
    accessoriesInkTop: moveFooter ? (lyrics.rightAccessoriesInkTop ?? 0) : (input.left.accessoriesInkTop ?? 0) * leftScale,
    lyricsInkTop: lyrics.inkTop ?? 0,
    lyricsInkBottom: lyrics.inkBottom ?? 0,
    layoutDensity: moveFooter ? "short" : compact ? "compact" : "normal",
    lyricsRect: rect(lyricsX, lyricsY, lyrics.lyricsWidth, lyricsHeight),
    lyricsNaturalHeight: Math.ceil(lyrics.naturalHeight),
    leftScale: round(leftScale),
    flexibleGap: Math.max(0, Math.round(flexibleGap)),
    score: round(score)
  };
}

export function scoreLandscapeCandidate(input: {
  lyrics: LandscapeLyricsMeasurement;
  canvasWidth: number;
  canvasHeight: number;
  internalHeight: number;
  requestedInternalHeight: number;
}) {
  let score = 0;
  for (const line of input.lyrics.lines) {
    const weight = line.kind === "translation" ? 0.68 : 1;
    const extraRows = Math.max(0, line.visualLineCount - 1);
    if (line.horizontalOverflow) score += 1_000_000 * weight;
    if (line.severeOrphan) score += 120_000 * weight;
    // Multiple wraps rapidly become more expensive than ordinary two-row wrapping.
    score += Math.pow(extraRows, 2) * 7_500 * weight;
    if (line.visualLineCount > 1 && line.lastLineFill < 0.22) {
      score += (0.22 - line.lastLineFill) * 48_000 * weight;
    }
    if (line.averageLineFill < 0.28) score += (0.28 - line.averageLineFill) * 680 * weight;
  }

  const aspectRatio = input.canvasWidth / Math.max(1, input.canvasHeight);
  if (aspectRatio < 1.18) score += Math.pow(1.18 - aspectRatio, 2) * 20_000;
  if (aspectRatio > 2.45) score += Math.pow(aspectRatio - 2.45, 2) * 14_000;
  // Reward compact use of the vertical composition, but requested manual space is intentional.
  const intentionalFloor = Math.max(input.lyrics.naturalHeight, input.requestedInternalHeight);
  const unusedVerticalShare = Math.max(0, input.internalHeight - intentionalFloor) / Math.max(1, input.internalHeight);
  score += unusedVerticalShare * 420;
  score += (input.lyrics.lyricsWidth - LANDSCAPE_LYRICS_WIDTH_MIN) * 0.18;
  return score;
}

function nearestLyricsCandidate(candidates: LandscapeLyricsMeasurement[], width: number) {
  return candidates.reduce((nearest, candidate) => (
    Math.abs(candidate.lyricsWidth - width) < Math.abs(nearest.lyricsWidth - width)
      ? candidate
      : nearest
  ));
}

function isUsableLyricsMeasurement(value: LandscapeLyricsMeasurement) {
  return Number.isFinite(value.lyricsWidth) && value.lyricsWidth > 0 &&
    Number.isFinite(value.naturalHeight) && value.naturalHeight > 0 &&
    Array.isArray(value.lines) && value.lines.length > 0;
}

function rect(x: number, y: number, width: number, height: number): LayoutRect {
  return { x: round(x), y: round(y), width: Math.ceil(width), height: Math.ceil(height) };
}

function roundedSize(width: number, height: number) {
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

function clampRounded(value: number, min: number, max: number) {
  return Math.round(clamp(Number.isFinite(value) ? value : min, min, max));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
