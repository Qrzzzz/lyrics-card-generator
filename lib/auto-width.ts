export const AUTO_WIDTH_MIN = 720;
export const AUTO_WIDTH_MAX = 1440;
export const AUTO_WIDTH_STEP = 20;
export const AUTO_WIDTH_DEBOUNCE_MS = 300;
export const AUTO_WIDTH_SETTLE_TOLERANCE = 5;
export const AUTO_WIDTH_TARGET_FILL = 0.625;

export type AutoWidthLineKind = "lyric" | "translation";

export type AutoWidthLineMetrics = {
  key: string;
  kind: AutoWidthLineKind;
  logicalUnitCount: number;
  visualLineCount: number;
  lastLineUnitCount: number;
  lastLineFill: number;
  maxLineFill: number;
  averageLineFill: number;
  severeOrphan: boolean;
  horizontalOverflow: boolean;
};

export type AutoWidthCandidateMetrics = {
  canvasWidth: number;
  lines: AutoWidthLineMetrics[];
};

export type AutoWidthDecision = {
  width: number;
  score: number;
  confidence: "high" | "low";
  reason: "optimized" | "insufficient-samples" | "extreme-distribution" | "measurement-failed";
};

export function isAutoWidthMeasurementEnabled(state: {
  style: {
    autoWidth: boolean;
    layoutMode?: "portrait" | "landscape";
    ratio: string;
    contentMode: string;
  };
}) {
  return (
    state.style.autoWidth === true &&
    (state.style.layoutMode ?? "portrait") === "portrait" &&
    state.style.ratio === "custom" &&
    state.style.contentMode === "lyrics"
  );
}

export function getAutoWidthCandidates() {
  const candidates: number[] = [];
  for (let width = AUTO_WIDTH_MIN; width <= AUTO_WIDTH_MAX; width += AUTO_WIDTH_STEP) {
    candidates.push(width);
  }
  return candidates;
}

/**
 * Chooses a width from a complete measurement grid. Incomplete or statistically
 * unstable samples deliberately retain the nearest current width instead of
 * producing a visually surprising low-confidence adjustment.
 */
export function chooseAutoWidth(
  candidates: AutoWidthCandidateMetrics[],
  fallbackWidthHint: number
): AutoWidthDecision {
  const fallbackWidth = nearestCandidateWidth(fallbackWidthHint, candidates);
  const fallback = candidates.find((candidate) => candidate.canvasWidth === fallbackWidth);
  if (!fallback || candidates.length === 0 || !haveCompleteLineSets(candidates, fallback)) {
    return {
      width: fallbackWidth,
      score: Number.POSITIVE_INFINITY,
      confidence: "low",
      reason: "measurement-failed"
    };
  }

  const lyricLines = fallback.lines.filter((line) => line.kind === "lyric" && line.logicalUnitCount > 0);
  if (lyricLines.length < 3) {
    return {
      width: fallbackWidth,
      score: scoreCandidate(fallback, new Set(lyricLines.map((line) => line.key)), new Set()),
      confidence: "low",
      reason: "insufficient-samples"
    };
  }

  const lyricCore = selectCoreLineKeys(lyricLines);
  const translationCore = selectCoreLineKeys(
    fallback.lines.filter((line) => line.kind === "translation" && line.logicalUnitCount > 0)
  );
  if (hasExtremeCoreDistribution(lyricLines, lyricCore)) {
    return {
      width: fallbackWidth,
      score: scoreCandidate(fallback, lyricCore, translationCore),
      confidence: "low",
      reason: "extreme-distribution"
    };
  }

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, lyricCore, translationCore)
    }))
    .sort((left, right) => left.score - right.score || left.candidate.canvasWidth - right.candidate.canvasWidth);
  const best = scored[0];

  return {
    width: best?.candidate.canvasWidth ?? fallbackWidth,
    score: best?.score ?? Number.POSITIVE_INFINITY,
    confidence: "high",
    reason: "optimized"
  };
}

export function selectCoreLineKeys(lines: AutoWidthLineMetrics[]) {
  const useful = lines.filter((line) => line.logicalUnitCount > 0);
  if (useful.length <= 3) {
    return new Set(useful.map((line) => line.key));
  }

  // Score representative lines around the median so one unusually short or
  // long lyric cannot dominate the width chosen for the whole document.
  const lengths = useful.map((line) => line.logicalUnitCount).sort((left, right) => left - right);
  const center = median(lengths);
  const lower = Math.max(3, center * 0.45);
  const upper = Math.max(center + 2, center * 1.8);
  let core = useful.filter((line) => line.logicalUnitCount >= lower && line.logicalUnitCount <= upper);
  if (core.length < 3) {
    core = [...useful]
      .sort((left, right) =>
        Math.abs(left.logicalUnitCount - center) - Math.abs(right.logicalUnitCount - center)
      )
      .slice(0, 3);
  }
  return new Set(core.map((line) => line.key));
}

export function scoreCandidate(
  candidate: AutoWidthCandidateMetrics,
  lyricCore: ReadonlySet<string>,
  translationCore: ReadonlySet<string>
) {
  // Overflow and severe orphans dominate the aesthetic fill/wrap penalties;
  // a compact candidate must never win by clipping readable content.
  let score = 0;
  const lyricCoreFills: number[] = [];
  const translationCoreFills: number[] = [];
  let lyricCoreExtraLines = 0;
  let translationCoreExtraLines = 0;

  for (const line of candidate.lines) {
    const isTranslation = line.kind === "translation";
    const isCore = (isTranslation ? translationCore : lyricCore).has(line.key);
    const kindWeight = isTranslation ? 0.6 : 1;
    const extraLines = Math.max(0, line.visualLineCount - 1);

    if (line.horizontalOverflow) score += 100_000;
    if (line.severeOrphan) {
      score += isCore ? (isTranslation ? 9_000 : 14_000) : (isTranslation ? 350 : 700);
    }
    if (isCore) {
      (isTranslation ? translationCoreFills : lyricCoreFills).push(line.maxLineFill);
      if (isTranslation) {
        translationCoreExtraLines += extraLines;
      } else {
        lyricCoreExtraLines += extraLines;
      }
      if (line.averageLineFill < 0.38) score += (0.38 - line.averageLineFill) * 160 * kindWeight;
    }
  }

  score += fillPenalty(lyricCoreFills, 1);
  score += fillPenalty(translationCoreFills, 0.6);
  score += normalizedWrapPenalty(lyricCoreExtraLines, lyricCoreFills.length, 1);
  score += normalizedWrapPenalty(translationCoreExtraLines, translationCoreFills.length, 0.6);

  return score;
}

function hasExtremeCoreDistribution(lines: AutoWidthLineMetrics[], coreKeys: ReadonlySet<string>) {
  const lengths = lines
    .filter((line) => coreKeys.has(line.key))
    .map((line) => line.logicalUnitCount)
    .sort((left, right) => left - right);
  if (lengths.length < 3) return true;
  return lengths[lengths.length - 1] / Math.max(1, lengths[0]) > 3.2;
}

function fillPenalty(fills: number[], weight: number) {
  if (fills.length === 0) return 0;
  const fill = median(fills);
  return Math.pow(fill - AUTO_WIDTH_TARGET_FILL, 2) * 5_000 * weight;
}

function normalizedWrapPenalty(extraLines: number, coreLineCount: number, weight: number) {
  if (coreLineCount === 0) return 0;
  return (extraLines / coreLineCount) * 24 * weight;
}

function haveCompleteLineSets(candidates: AutoWidthCandidateMetrics[], fallback: AutoWidthCandidateMetrics) {
  const expectedWidths = getAutoWidthCandidates();
  const actualWidths = [...new Set(candidates.map((candidate) => candidate.canvasWidth))]
    .sort((left, right) => left - right);
  if (
    actualWidths.length !== candidates.length ||
    actualWidths.length !== expectedWidths.length ||
    actualWidths.some((width, index) => width !== expectedWidths[index])
  ) {
    return false;
  }

  const expected = [...new Set(fallback.lines.map((line) => line.key))].sort();
  if (expected.length === 0 || expected.length !== fallback.lines.length) return false;
  return candidates.every((candidate) => {
    const actual = [...new Set(candidate.lines.map((line) => line.key))].sort();
    return actual.length === candidate.lines.length &&
      actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]);
  });
}

function nearestCandidateWidth(currentWidth: number, candidates: AutoWidthCandidateMetrics[]) {
  const widths = candidates.length > 0
    ? candidates.map((candidate) => candidate.canvasWidth)
    : getAutoWidthCandidates();
  return widths.reduce((nearest, width) =>
    Math.abs(width - currentWidth) < Math.abs(nearest - currentWidth) ? width : nearest
  );
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}
