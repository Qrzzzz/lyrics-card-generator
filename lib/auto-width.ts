export const AUTO_WIDTH_MIN = 720;
export const AUTO_WIDTH_MAX = 1440;
export const AUTO_WIDTH_STEP = 20;
export const AUTO_WIDTH_DEBOUNCE_MS = 300;
export const AUTO_WIDTH_SETTLE_TOLERANCE = 20;
export const AUTO_WIDTH_SOFT_MIN = 880;
export const AUTO_WIDTH_SOFT_MAX = 1200;

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

export function chooseAutoWidth(
  candidates: AutoWidthCandidateMetrics[],
  currentWidth: number
): AutoWidthDecision {
  const fallbackWidth = nearestCandidateWidth(currentWidth, candidates);
  const fallback = candidates.find((candidate) => candidate.canvasWidth === fallbackWidth);
  if (!fallback || candidates.length === 0 || candidates.some((candidate) => candidate.lines.length === 0)) {
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
      score: scoreCandidate(fallback, currentWidth, new Set(lyricLines.map((line) => line.key)), new Set()),
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
      score: scoreCandidate(fallback, currentWidth, lyricCore, translationCore),
      confidence: "low",
      reason: "extreme-distribution"
    };
  }

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, currentWidth, lyricCore, translationCore)
    }))
    .sort((left, right) => left.score - right.score ||
      Math.abs(left.candidate.canvasWidth - currentWidth) - Math.abs(right.candidate.canvasWidth - currentWidth) ||
      left.candidate.canvasWidth - right.candidate.canvasWidth);
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
  currentWidth: number,
  lyricCore: ReadonlySet<string>,
  translationCore: ReadonlySet<string>
) {
  let score = 0;
  const lyricCoreFills: number[] = [];
  const translationCoreFills: number[] = [];

  for (const line of candidate.lines) {
    const isTranslation = line.kind === "translation";
    const isCore = (isTranslation ? translationCore : lyricCore).has(line.key);
    const kindWeight = isTranslation ? 0.6 : 1;
    const extraLines = Math.max(0, line.visualLineCount - 1);

    if (line.horizontalOverflow) score += 100_000;
    if (line.severeOrphan) {
      score += isCore ? (isTranslation ? 9_000 : 14_000) : (isTranslation ? 350 : 700);
    }
    score += extraLines * (isCore ? 120 : 30) * kindWeight;

    if (isCore) {
      (isTranslation ? translationCoreFills : lyricCoreFills).push(line.maxLineFill);
      if (line.averageLineFill < 0.42) score += (0.42 - line.averageLineFill) * 160 * kindWeight;
    }
  }

  score += fillPenalty(lyricCoreFills, 1);
  score += fillPenalty(translationCoreFills, 0.6);

  if (candidate.canvasWidth < AUTO_WIDTH_SOFT_MIN) {
    score += ((AUTO_WIDTH_SOFT_MIN - candidate.canvasWidth) / AUTO_WIDTH_STEP) * 80;
  } else if (candidate.canvasWidth > AUTO_WIDTH_SOFT_MAX) {
    score += ((candidate.canvasWidth - AUTO_WIDTH_SOFT_MAX) / AUTO_WIDTH_STEP) * 120;
  }

  const delta = Math.abs(candidate.canvasWidth - currentWidth);
  const inexpensiveDelta = Math.max(AUTO_WIDTH_STEP * 2, currentWidth * 0.08);
  score += delta / AUTO_WIDTH_STEP;
  if (delta > inexpensiveDelta) {
    score += Math.pow((delta - inexpensiveDelta) / AUTO_WIDTH_STEP, 1.35) * 5;
  }

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
  if (fill < 0.58) return Math.pow(0.58 - fill, 2) * 5_000 * weight;
  if (fill > 0.97) return Math.pow(fill - 0.97, 2) * 2_000 * weight;
  return 0;
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
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}
