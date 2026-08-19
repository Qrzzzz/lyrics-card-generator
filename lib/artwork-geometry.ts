import type { CoverArtworkAnalysis } from "@/lib/types";

export type AdaptiveArtworkSize = {
  width: number;
  height: number;
  aspectRatio: number;
  constrained: boolean;
};

type AdaptiveArtworkSizeInput = {
  baseSize: number;
  aspectRatio?: number;
  maxWidth?: number;
  maxHeight?: number;
};

/**
 * Resolves the natural artwork ratio only when it belongs to the image that is
 * currently rendered. A stale analysis must never resize a replacement cover.
 */
export function getArtworkAspectRatio(
  sourceUrl: string | undefined,
  analysis: CoverArtworkAnalysis | undefined
) {
  if (
    !sourceUrl ||
    !analysis ||
    analysis.status !== "ready" ||
    analysis.sourceUrl !== sourceUrl ||
    !Number.isFinite(analysis.aspectRatio) ||
    analysis.aspectRatio <= 0
  ) {
    return 1;
  }

  return analysis.aspectRatio;
}

/** An absent cover and a failed image are both settled, so export cannot hang. */
export function isArtworkAnalysisSettled(
  sourceUrl: string | undefined,
  analysis: CoverArtworkAnalysis | undefined
) {
  if (!sourceUrl) return true;
  return Boolean(analysis && analysis.sourceUrl === sourceUrl);
}

/**
 * Horizontal artwork keeps the normal square height; vertical artwork keeps
 * the normal square width. Only physical canvas bounds may scale both axes.
 */
export function resolveAdaptiveArtworkSize({
  baseSize,
  aspectRatio = 1,
  maxWidth = Number.POSITIVE_INFINITY,
  maxHeight = Number.POSITIVE_INFINITY
}: AdaptiveArtworkSizeInput): AdaptiveArtworkSize {
  const safeBase = finitePositive(baseSize, 1);
  const safeRatio = finitePositive(aspectRatio, 1);
  const rawWidth = safeRatio >= 1 ? safeBase * safeRatio : safeBase;
  const rawHeight = safeRatio >= 1 ? safeBase : safeBase / safeRatio;
  const widthLimit = finitePositive(maxWidth, Number.POSITIVE_INFINITY);
  const heightLimit = finitePositive(maxHeight, Number.POSITIVE_INFINITY);
  const scale = Math.min(1, widthLimit / rawWidth, heightLimit / rawHeight);

  return {
    width: Math.max(1, Math.round(rawWidth * scale)),
    height: Math.max(1, Math.round(rawHeight * scale)),
    aspectRatio: safeRatio,
    constrained: scale < 0.9995
  };
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
