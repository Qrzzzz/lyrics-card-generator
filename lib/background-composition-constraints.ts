import type { LandscapeLayout, PortraitLayout, Rect } from "@/lib/card-layout-engine";
import type { CardStyle, ExtractedPalette } from "@/lib/types";

export type ReadabilityZoneRole = "title-metadata" | "lyrics" | "instrumental" | "footer";

export type ReadabilityZone = {
  id: string;
  role: ReadabilityZoneRole;
  rect: Rect;
  feather: number;
  targetContrast: number;
  opacityScale: number;
};

export type CardReadabilityPlan = {
  canvas: { width: number; height: number };
  textColor: string;
  overlayColor: "#000000" | "#FFFFFF";
  overlayOpacity: number;
  assumedBackgroundLuminance: number;
  alignment: "left" | "center";
  zones: ReadabilityZone[];
};

export type RgbSample = { r: number; g: number; b: number; a?: number };

export type CompositionSampleGrid = {
  width: number;
  height: number;
  samples: readonly RgbSample[];
};

export type CompositionThresholds = {
  minimumTextContrast: number;
  maximumAdjacentColorDeltaP95: number;
  maximumAdjacentColorDelta: number;
  maximumLuminanceStepP95: number;
  maximumLuminanceStep: number;
  maximumBrightFraction: number;
  maximumBrightComponentFraction: number;
  maximumDarkFraction: number;
  minimumDarkFloorP02: number;
  maximumClosedContourCount: number;
  maximumClosedContourFraction: number;
  maximumParallelBandScore: number;
};

export type CompositionMetrics = {
  minimumTextContrast: number;
  adjacentColorDeltaP95: number;
  maximumAdjacentColorDelta: number;
  luminanceStepP95: number;
  maximumLuminanceStep: number;
  brightFraction: number;
  largestBrightComponentFraction: number;
  darkFraction: number;
  darkFloorP02: number;
  closedContourCount: number;
  largestClosedContourFraction: number;
  parallelBandScore: number;
};

export type CompositionEvaluation = {
  pass: boolean;
  metrics: CompositionMetrics;
  failures: Array<keyof CompositionThresholds>;
};

export const DEFAULT_COMPOSITION_THRESHOLDS: CompositionThresholds = {
  minimumTextContrast: 4.5,
  maximumAdjacentColorDeltaP95: 0.085,
  maximumAdjacentColorDelta: 0.16,
  maximumLuminanceStepP95: 0.075,
  maximumLuminanceStep: 0.14,
  maximumBrightFraction: 0.18,
  maximumBrightComponentFraction: 0.1,
  maximumDarkFraction: 0.2,
  minimumDarkFloorP02: 0.008,
  maximumClosedContourCount: 3,
  maximumClosedContourFraction: 0.1,
  maximumParallelBandScore: 0.22
};

const BRIGHT_SPOT_THRESHOLD = 0.78;
const DARK_FLOOR_THRESHOLD = 0.025;

/**
 * Builds local text protection from the real card layout. It deliberately does
 * not know how palette anchors or a future color field are generated.
 */
export function createCardReadabilityPlan({
  canvas,
  style,
  palette,
  layout
}: {
  canvas: { width: number; height: number };
  style: CardStyle;
  palette: ExtractedPalette;
  layout: PortraitLayout | LandscapeLayout;
}): CardReadabilityPlan {
  const textColor = style.resolvedTextColor || "#FFFFFF";
  const textLuminance = relativeLuminance(parseHexColor(textColor));
  const overlayColor = textLuminance >= 0.5 ? "#000000" : "#FFFFFF";
  const assumedBackgroundLuminance = estimateSafetyZoneLuminance(palette, overlayColor);
  const targetContrast = 4.65;
  const overlayOpacity = clamp(
    requiredOverlayOpacity(textLuminance, assumedBackgroundLuminance, targetContrast, overlayColor),
    0.18,
    0.52
  );
  const feather = clamp(Math.round(Math.min(canvas.width, canvas.height) * 0.055), 34, 104);
  const zones = (style.layoutMode ?? "portrait") === "landscape"
    ? createLandscapeZones(canvas, style, layout as LandscapeLayout, feather, targetContrast)
    : createPortraitZones(canvas, style, layout as PortraitLayout, feather, targetContrast);

  return {
    canvas,
    textColor,
    overlayColor,
    overlayOpacity,
    assumedBackgroundLuminance,
    alignment: style.align,
    zones
  };
}

export function applyReadabilityPlanToGrid(
  grid: CompositionSampleGrid,
  plan: CardReadabilityPlan
): CompositionSampleGrid {
  assertGrid(grid);
  const overlay = parseHexColor(plan.overlayColor);
  const samples = grid.samples.map((sample, index) => {
    const x = ((index % grid.width) + 0.5) / grid.width * plan.canvas.width;
    const y = (Math.floor(index / grid.width) + 0.5) / grid.height * plan.canvas.height;
    let result = { ...sample };

    for (const zone of plan.zones) {
      const weight = zoneWeight(x, y, zone.rect, zone.feather);
      const alpha = plan.overlayOpacity * zone.opacityScale * weight;
      if (alpha <= 0) continue;
      result = {
        r: mixChannel(result.r, overlay.r, alpha),
        g: mixChannel(result.g, overlay.g, alpha),
        b: mixChannel(result.b, overlay.b, alpha),
        a: result.a
      };
    }

    return result;
  });

  return { ...grid, samples };
}

/** Evaluates a downsampled background-only image. Text and fine-grid pixels should be excluded upstream. */
export function evaluateBackgroundComposition(
  grid: CompositionSampleGrid,
  plan: CardReadabilityPlan,
  thresholds: CompositionThresholds = DEFAULT_COMPOSITION_THRESHOLDS
): CompositionEvaluation {
  assertGrid(grid);
  const smoothed = boxBlur3x3(grid);
  const luminances = smoothed.samples.map((sample) => relativeLuminance(sample));
  const oklab = smoothed.samples.map(rgbToOklab);
  const colorDeltas: number[] = [];
  const luminanceSteps: number[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const index = y * grid.width + x;
      if (x + 1 < grid.width) collectAdjacent(index, index + 1);
      if (y + 1 < grid.height) collectAdjacent(index, index + grid.width);
    }
  }

  const brightMask = luminances.map((value) => value >= BRIGHT_SPOT_THRESHOLD);
  const brightComponents = connectedComponents(brightMask, grid.width, grid.height);
  const closedComponents = brightComponents.filter((component) => !component.touchesEdge && component.size >= 4);
  const textLuminance = relativeLuminance(parseHexColor(plan.textColor));
  const zoneContrasts = plan.zones.flatMap((zone) => samplesInsideRect(luminances, grid.width, grid.height, plan.canvas, zone.rect)
    .map((background) => contrastRatio(textLuminance, background)));
  const metrics: CompositionMetrics = {
    minimumTextContrast: zoneContrasts.length > 0 ? Math.min(...zoneContrasts) : Number.POSITIVE_INFINITY,
    adjacentColorDeltaP95: percentile(colorDeltas, 0.95),
    maximumAdjacentColorDelta: maxOrZero(colorDeltas),
    luminanceStepP95: percentile(luminanceSteps, 0.95),
    maximumLuminanceStep: maxOrZero(luminanceSteps),
    brightFraction: countTrue(brightMask) / luminances.length,
    largestBrightComponentFraction: maxOrZero(brightComponents.map((component) => component.size)) / luminances.length,
    darkFraction: luminances.filter((value) => value <= DARK_FLOOR_THRESHOLD).length / luminances.length,
    darkFloorP02: percentile(luminances, 0.02),
    closedContourCount: closedComponents.length,
    largestClosedContourFraction: maxOrZero(closedComponents.map((component) => component.size)) / luminances.length,
    parallelBandScore: calculateParallelBandScore(luminances, grid.width, grid.height)
  };
  const failures: Array<keyof CompositionThresholds> = [];

  if (metrics.minimumTextContrast < thresholds.minimumTextContrast) failures.push("minimumTextContrast");
  if (metrics.adjacentColorDeltaP95 > thresholds.maximumAdjacentColorDeltaP95) failures.push("maximumAdjacentColorDeltaP95");
  if (metrics.maximumAdjacentColorDelta > thresholds.maximumAdjacentColorDelta) failures.push("maximumAdjacentColorDelta");
  if (metrics.luminanceStepP95 > thresholds.maximumLuminanceStepP95) failures.push("maximumLuminanceStepP95");
  if (metrics.maximumLuminanceStep > thresholds.maximumLuminanceStep) failures.push("maximumLuminanceStep");
  if (metrics.brightFraction > thresholds.maximumBrightFraction) failures.push("maximumBrightFraction");
  if (metrics.largestBrightComponentFraction > thresholds.maximumBrightComponentFraction) failures.push("maximumBrightComponentFraction");
  if (metrics.darkFraction > thresholds.maximumDarkFraction) failures.push("maximumDarkFraction");
  if (metrics.darkFloorP02 < thresholds.minimumDarkFloorP02) failures.push("minimumDarkFloorP02");
  if (metrics.closedContourCount > thresholds.maximumClosedContourCount) failures.push("maximumClosedContourCount");
  if (metrics.largestClosedContourFraction > thresholds.maximumClosedContourFraction) failures.push("maximumClosedContourFraction");
  if (metrics.parallelBandScore > thresholds.maximumParallelBandScore) failures.push("maximumParallelBandScore");

  return { pass: failures.length === 0, metrics, failures };

  function collectAdjacent(left: number, right: number) {
    colorDeltas.push(oklabDistance(oklab[left], oklab[right]));
    luminanceSteps.push(Math.abs(luminances[left] - luminances[right]));
  }
}

function createPortraitZones(
  canvas: { width: number; height: number },
  style: CardStyle,
  layout: PortraitLayout,
  feather: number,
  targetContrast: number
) {
  const zones: ReadabilityZone[] = [];
  const contentMode = style.contentMode ?? "lyrics";
  if (contentMode === "instrumental") {
    zones.push(zone("instrumental", layout.lyricsRect, feather * 1.15, targetContrast, 1));
  } else {
    if (style.showSongInfo && layout.headerRect) {
      const coverOffset = style.showCover && layout.coverRect ? layout.coverRect.width + 40 : 0;
      zones.push(zone("title-metadata", {
        x: layout.safeRect.x + coverOffset,
        y: layout.headerRect.y,
        width: Math.max(1, layout.safeRect.width - coverOffset),
        height: layout.headerRect.height
      }, feather, targetContrast, 0.96));
    }
    zones.push(zone("lyrics", layout.lyricsRect, feather * 1.08, targetContrast, 1));
  }
  if (layout.footerRect) zones.push(zone("footer", layout.footerRect, feather * 0.82, targetContrast, 0.9));
  return zones.map((item) => ({ ...item, rect: clampRect(item.rect, canvas) }));
}

function createLandscapeZones(
  canvas: { width: number; height: number },
  style: CardStyle,
  layout: LandscapeLayout,
  feather: number,
  targetContrast: number
) {
  const zones: ReadabilityZone[] = [];
  const contentMode = style.contentMode ?? "lyrics";
  if (contentMode === "instrumental") {
    zones.push(zone("instrumental", {
      x: layout.contentRect.x,
      y: layout.contentRect.y + layout.contentRect.height * 0.14,
      width: layout.contentRect.width,
      height: layout.contentRect.height * 0.58
    }, feather * 1.12, targetContrast, 1));
  } else {
    if (style.showSongInfo && layout.songInfoRect) {
      zones.push(zone("title-metadata", layout.songInfoRect, feather, targetContrast, 0.96));
    }
    zones.push(zone("lyrics", layout.lyricsRect, feather * 1.08, targetContrast, 1));
  }
  if (layout.footerRect) zones.push(zone("footer", layout.footerRect, feather * 0.82, targetContrast, 0.9));
  return zones.map((item) => ({ ...item, rect: clampRect(item.rect, canvas) }));
}

function zone(
  role: ReadabilityZoneRole,
  rect: Rect,
  feather: number,
  targetContrast: number,
  opacityScale: number
): ReadabilityZone {
  return {
    id: `${role}-${Math.round(rect.x)}-${Math.round(rect.y)}`,
    role,
    rect,
    feather: Math.round(feather),
    targetContrast,
    opacityScale
  };
}

function estimateSafetyZoneLuminance(palette: ExtractedPalette, overlayColor: "#000000" | "#FFFFFF") {
  const candidates = [palette.primary, palette.secondary, palette.accent, palette.muted]
    .filter((value): value is string => Boolean(value))
    .map((value) => relativeLuminance(parseHexColor(value)));
  if (overlayColor === "#000000") {
    return clamp(Math.max(palette.averageLuminance * 0.58, ...candidates.map((value) => value * 0.72)), 0.24, 0.34);
  }
  return clamp(Math.min(palette.averageLuminance * 0.58, ...candidates.map((value) => value * 0.72)), 0.045, 0.22);
}

function requiredOverlayOpacity(
  textLuminance: number,
  backgroundLuminance: number,
  targetContrast: number,
  overlayColor: "#000000" | "#FFFFFF"
) {
  if (overlayColor === "#000000") {
    const maximumBackground = (textLuminance + 0.05) / targetContrast - 0.05;
    return backgroundLuminance <= maximumBackground ? 0 : 1 - maximumBackground / backgroundLuminance;
  }
  const minimumBackground = targetContrast * (textLuminance + 0.05) - 0.05;
  return backgroundLuminance >= minimumBackground ? 0 : (minimumBackground - backgroundLuminance) / (1 - backgroundLuminance);
}

function zoneWeight(x: number, y: number, rect: Rect, feather: number) {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.width));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.height));
  const distance = Math.hypot(dx, dy);
  if (distance <= 0) return 1;
  const normalized = clamp(distance / Math.max(1, feather), 0, 1);
  return 1 - smoothstep(normalized);
}

function samplesInsideRect(
  values: readonly number[],
  width: number,
  height: number,
  canvas: { width: number; height: number },
  rect: Rect
) {
  const result: number[] = [];
  for (let y = 0; y < height; y += 1) {
    const canvasY = (y + 0.5) / height * canvas.height;
    if (canvasY < rect.y || canvasY > rect.y + rect.height) continue;
    for (let x = 0; x < width; x += 1) {
      const canvasX = (x + 0.5) / width * canvas.width;
      if (canvasX >= rect.x && canvasX <= rect.x + rect.width) result.push(values[y * width + x]);
    }
  }
  return result;
}

function boxBlur3x3(grid: CompositionSampleGrid): CompositionSampleGrid {
  const samples = grid.samples.map((_, index) => {
    const centerX = index % grid.width;
    const centerY = Math.floor(index / grid.width);
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const x = centerX + offsetX;
        const y = centerY + offsetY;
        if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;
        const sample = grid.samples[y * grid.width + x];
        r += sample.r;
        g += sample.g;
        b += sample.b;
        count += 1;
      }
    }
    return { r: r / count, g: g / count, b: b / count };
  });
  return { ...grid, samples };
}

function connectedComponents(mask: readonly boolean[], width: number, height: number) {
  const seen = new Uint8Array(mask.length);
  const components: Array<{ size: number; touchesEdge: boolean }> = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    let size = 0;
    let touchesEdge = false;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const x = index % width;
      const y = Math.floor(index / width);
      size += 1;
      touchesEdge ||= x === 0 || y === 0 || x === width - 1 || y === height - 1;
      for (const [nextX, nextY] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (mask[next] && !seen[next]) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    components.push({ size, touchesEdge });
  }
  return components;
}

function calculateParallelBandScore(values: readonly number[], width: number, height: number) {
  const rows = Array.from({ length: height }, (_, y) => mean(values.slice(y * width, (y + 1) * width)));
  const columns = Array.from({ length: width }, (_, x) => {
    const column: number[] = [];
    for (let y = 0; y < height; y += 1) column.push(values[y * width + x]);
    return mean(column);
  });
  return Math.max(axisBandScore(rows), axisBandScore(columns));
}

function axisBandScore(means: readonly number[]) {
  if (means.length < 4) return 0;
  const steps = means.slice(1).map((value, index) => Math.abs(value - means[index]));
  const strong = steps.filter((value) => value >= 0.045).length / steps.length;
  const alternating = steps.slice(1).filter((value, index) => {
    const priorSign = Math.sign(means[index + 1] - means[index]);
    const nextSign = Math.sign(means[index + 2] - means[index + 1]);
    return priorSign !== 0 && nextSign !== 0 && priorSign !== nextSign;
  }).length / Math.max(1, steps.length - 1);
  return strong * (0.6 + alternating * 0.4);
}

function parseHexColor(value: string): RgbSample {
  const normalized = value.trim().replace(/^#/, "");
  const hex = /^[0-9a-f]{6}$/i.test(normalized) ? normalized : "FFFFFF";
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function relativeLuminance(sample: RgbSample) {
  const linear = [sample.r, sample.g, sample.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function rgbToOklab(sample: RgbSample) {
  const channels = [sample.r, sample.g, sample.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.4122214708 * channels[0] + 0.5363325363 * channels[1] + 0.0514459929 * channels[2];
  const m = 0.2119034982 * channels[0] + 0.6806995451 * channels[1] + 0.1073969566 * channels[2];
  const s = 0.0883024619 * channels[0] + 0.2817188376 * channels[1] + 0.6299787005 * channels[2];
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot
  };
}

function oklabDistance(left: { l: number; a: number; b: number }, right: { l: number; a: number; b: number }) {
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b);
}

function contrastRatio(left: number, right: number) {
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

function percentile(values: readonly number[], quantile: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
}

function clampRect(rect: Rect, canvas: { width: number; height: number }): Rect {
  const x = clamp(rect.x, 0, canvas.width);
  const y = clamp(rect.y, 0, canvas.height);
  return {
    x,
    y,
    width: Math.max(1, Math.min(rect.width, canvas.width - x)),
    height: Math.max(1, Math.min(rect.height, canvas.height - y))
  };
}

function assertGrid(grid: CompositionSampleGrid) {
  if (!Number.isInteger(grid.width) || !Number.isInteger(grid.height) || grid.width <= 0 || grid.height <= 0) {
    throw new Error("Composition grid dimensions must be positive integers.");
  }
  if (grid.samples.length !== grid.width * grid.height) {
    throw new Error("Composition grid sample count does not match its dimensions.");
  }
}

function countTrue(values: readonly boolean[]) {
  return values.reduce((count, value) => count + Number(value), 0);
}

function maxOrZero(values: readonly number[]) {
  return values.length > 0 ? Math.max(...values) : 0;
}

function mean(values: readonly number[]) {
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function mixChannel(from: number, to: number, alpha: number) {
  return from + (to - from) * clamp(alpha, 0, 1);
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
