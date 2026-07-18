export type ResizableSplitGeometry = {
  viewportWidth: number;
  usableWidth: number;
  leadingWidth: number;
  trailingWidth: number;
  ratio: number;
  minRatio: number;
  maxRatio: number;
  gap: number;
};

type ResolveResizableSplitInput = {
  viewportWidth: number;
  requestedRatio: number;
  defaultRatio: number;
  minRatio: number;
  maxRatio: number;
  minLeadingWidth: number;
  minTrailingWidth: number;
  gap: number;
};

type ResolveSplitPointerRatioInput = {
  clientX: number;
  viewportLeft: number;
  viewportWidth: number;
  gap: number;
  minRatio: number;
  maxRatio: number;
};

type ResolveSplitKeyboardRatioInput = {
  key: string;
  shiftKey: boolean;
  currentRatio: number;
  minRatio: number;
  maxRatio: number;
  step?: number;
  acceleratedStep?: number;
};

export function clampSplitRatio(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function resolveResizableSplit({
  viewportWidth,
  requestedRatio,
  defaultRatio,
  minRatio,
  maxRatio,
  minLeadingWidth,
  minTrailingWidth,
  gap
}: ResolveResizableSplitInput): ResizableSplitGeometry {
  const resolvedViewportWidth = Math.max(0, viewportWidth);
  const usableWidth = Math.max(0, resolvedViewportWidth - gap);

  if (usableWidth <= 0) {
    return {
      viewportWidth: resolvedViewportWidth,
      usableWidth,
      leadingWidth: 0,
      trailingWidth: 0,
      ratio: defaultRatio,
      minRatio,
      maxRatio,
      gap
    };
  }

  const widthConstrainedMinimum = minLeadingWidth / usableWidth;
  const widthConstrainedMaximum = 1 - minTrailingWidth / usableWidth;
  const resolvedMinimum = Math.max(minRatio, widthConstrainedMinimum);
  const resolvedMaximum = Math.min(maxRatio, widthConstrainedMaximum);
  const constraintsFit = resolvedMinimum <= resolvedMaximum;
  const effectiveMinimum = constraintsFit ? resolvedMinimum : minRatio;
  const effectiveMaximum = constraintsFit ? resolvedMaximum : minRatio;
  const ratio = clampSplitRatio(requestedRatio, effectiveMinimum, effectiveMaximum);
  const leadingWidth = usableWidth * ratio;

  return {
    viewportWidth: resolvedViewportWidth,
    usableWidth,
    leadingWidth,
    trailingWidth: usableWidth - leadingWidth,
    ratio,
    minRatio: effectiveMinimum,
    maxRatio: effectiveMaximum,
    gap
  };
}

export function resolveSplitPointerRatio({
  clientX,
  viewportLeft,
  viewportWidth,
  gap,
  minRatio,
  maxRatio
}: ResolveSplitPointerRatioInput) {
  const ratio = (clientX - viewportLeft - gap / 2) / Math.max(1, viewportWidth - gap);
  return clampSplitRatio(ratio, minRatio, maxRatio);
}

export function resolveSplitKeyboardRatio({
  key,
  shiftKey,
  currentRatio,
  minRatio,
  maxRatio,
  step = 0.02,
  acceleratedStep = 0.05
}: ResolveSplitKeyboardRatioInput): number | null {
  const increment = shiftKey ? acceleratedStep : step;
  let nextRatio: number | null = null;

  if (key === "ArrowLeft") {
    nextRatio = currentRatio - increment;
  } else if (key === "ArrowRight") {
    nextRatio = currentRatio + increment;
  } else if (key === "Home") {
    nextRatio = minRatio;
  } else if (key === "End") {
    nextRatio = maxRatio;
  }

  return nextRatio === null ? null : clampSplitRatio(nextRatio, minRatio, maxRatio);
}
