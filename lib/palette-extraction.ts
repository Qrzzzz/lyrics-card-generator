"use client";

import type {
  CoverArtworkAnalysis,
  CoverPaletteAnalysis,
  ExtractedPalette,
  PaletteRegionAnalysis,
  PaletteRoleReference
} from "@/lib/types";
import {
  oklabDistance,
  oklabToOklch,
  oklabToRgb,
  oklchToOklab,
  rgbToOklab,
  type OklabColor
} from "@/lib/color/oklab";
import {
  DEFAULT_PALETTE,
  hexToRgb,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
  type RgbColor
} from "@/lib/palette-background";

type Sample = RgbColor & { alpha: number; x: number; y: number; lab: OklabColor };
type ClusterResult = { centers: OklabColor[]; assignments: number[] };
type RegionWithInternalMetrics = PaletteRegionAnalysis & { lab: OklabColor; edgePresence: number };

export type AnalyzePalettePixelsOptions = { sourceWidth?: number; sourceHeight?: number };

const MAX_SAMPLE_EDGE = 96;
const CLUSTER_COUNT = 8;
const ITERATIONS = 12;
const SPATIAL_GRID_SIZE = 6;
const MIN_VISIBLE_ALPHA = 1 / 255;
const CLUSTER_MERGE_DISTANCE = 0.035;
export const COVER_IMAGE_ANALYSIS_TIMEOUT_MS = 8000;

export type CoverImageAnalysisResult = {
  palette: ExtractedPalette;
  artwork?: CoverArtworkAnalysis;
};

/** Decodes geometry, alpha, and palette together so every renderer shares one source of truth. */
export async function analyzeCoverImage(imageUrl: string): Promise<CoverImageAnalysisResult> {
  if (!imageUrl) return { palette: DEFAULT_PALETTE };

  let image: HTMLImageElement;
  try {
    image = await loadImage(imageUrl);
  } catch (error) {
    console.warn("Cover analysis failed. Falling back to square artwork geometry.", error);
    return {
      palette: DEFAULT_PALETTE,
      artwork: {
        sourceUrl: imageUrl,
        naturalWidth: 0,
        naturalHeight: 0,
        aspectRatio: 1,
        hasTransparency: false,
        status: "error"
      }
    };
  }

  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const aspectRatio = naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 1;
  const artworkBase = { sourceUrl: imageUrl, naturalWidth, naturalHeight, aspectRatio, status: "ready" as const };

  try {
    const sampleSize = resolveSampleSize(naturalWidth, naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = sampleSize.width;
    canvas.height = sampleSize.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return { palette: DEFAULT_PALETTE, artwork: { ...artworkBase, hasTransparency: false } };
    }

    // The whole cover is sampled with preserved aspect ratio. No edge,
    // corner, center, or small fixed set of probe points receives special treatment.
    context.drawImage(image, 0, 0, sampleSize.width, sampleSize.height);
    const { data } = context.getImageData(0, 0, sampleSize.width, sampleSize.height);
    const hasTransparency = containsTransparency(data);
    const palette = analyzePalettePixels(data, sampleSize.width, sampleSize.height, {
      sourceWidth: naturalWidth,
      sourceHeight: naturalHeight
    });
    return { palette, artwork: { ...artworkBase, hasTransparency } };
  } catch (error) {
    // Natural dimensions remain trustworthy even when CORS blocks canvas pixels.
    console.warn("Palette extraction failed. Keeping artwork geometry with the default palette.", error);
    return { palette: DEFAULT_PALETTE, artwork: { ...artworkBase, hasTransparency: false } };
  }
}

export async function extractPaletteFromImage(imageUrl: string): Promise<ExtractedPalette> {
  return (await analyzeCoverImage(imageUrl)).palette;
}

/** Pure deterministic integration boundary for spatial color fields and composition constraints. */
export function analyzePalettePixels(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: AnalyzePalettePixelsOptions = {}
): ExtractedPalette {
  assertPixelBuffer(data, width, height);
  const sourceWidth = positiveDimension(options.sourceWidth, width);
  const sourceHeight = positiveDimension(options.sourceHeight, height);
  const seedNumber = hashPixels(data, width, height, sourceWidth, sourceHeight);
  const seed = seedNumber.toString(16).padStart(8, "0").toUpperCase();
  const samples = collectSamples(data, width, height);
  const alphaSum = samples.reduce((total, sample) => total + sample.alpha, 0);
  const visibleCoverage = samples.length / (width * height);

  if (samples.length === 0 || alphaSum <= 0) {
    return fallbackPaletteWithAnalysis({
      seed,
      sourceWidth,
      sourceHeight,
      sampleWidth: width,
      sampleHeight: height,
      visibleCoverage: 0,
      meanAlpha: 0,
      regions: []
    });
  }

  const clusterResult = runKMeans(samples, Math.min(CLUSTER_COUNT, samples.length), seedNumber);
  const mergedAssignments = mergeNearbyClusters(clusterResult);
  const globalLab = weightedMeanLab(samples);
  const regions = buildRegions(samples, mergedAssignments, width, height, alphaSum, globalLab);
  const roles = selectRoles(regions);
  const metrics = calculateMetrics(samples, alphaSum);
  const kind = classifyPalette(regions, metrics.averageSaturation, metrics.hueVariance);
  const primary = roles.subject.color;
  const secondary = roles.transition.color;
  const accent = roles.highlights[0]?.color ?? farthestRegionColor(regions, roles.subject.regionId) ?? roles.base.color;
  // Preserve the legacy colors[0..2] role order even though the richer
  // contract exposes base/subject/transition/highlight explicitly.
  const orderedColors = uniqueColors([
    primary,
    secondary,
    accent,
    roles.base.color,
    ...roles.highlights.slice(1).map((role) => role.color),
    ...regions.map((region) => region.color)
  ]).slice(0, 8);
  const primaryOklch = oklabToOklch(rgbToOklab(hexToRgb(primary)));
  const baseOklch = oklabToOklch(rgbToOklab(hexToRgb(roles.base.color)));
  const dark = colorFromOklch({
    l: Math.min(0.28, primaryOklch.l),
    c: Math.min(0.18, primaryOklch.c * (kind === "colorful" ? 0.9 : 0.55)),
    h: primaryOklch.h
  });
  const light = colorFromOklch({
    l: Math.max(0.84, primaryOklch.l),
    c: Math.min(0.12, primaryOklch.c * (kind === "colorful" ? 0.55 : 0.32)),
    h: primaryOklch.h
  });
  const muted = colorFromOklch({
    l: clamp(baseOklch.l, 0.38, 0.68),
    c: Math.min(0.08, baseOklch.c * 0.48),
    h: baseOklch.h
  });
  const analysis: CoverPaletteAnalysis = {
    version: 1,
    seed,
    sourceWidth,
    sourceHeight,
    sampleWidth: width,
    sampleHeight: height,
    visibleCoverage,
    meanAlpha: alphaSum / (width * height),
    regions: regions.map(stripInternalMetrics),
    roles
  };

  return {
    colors: orderedColors,
    primary,
    secondary,
    accent,
    dark,
    light,
    muted,
    averageLuminance: metrics.averageLuminance,
    averageSaturation: metrics.averageSaturation,
    hueVariance: metrics.hueVariance,
    isLightCover: metrics.averageLuminance > 0.3,
    kind,
    analysis
  };
}

export { DEFAULT_PALETTE };

function resolveSampleSize(width: number, height: number) {
  if (width <= 0 || height <= 0) return { width: MAX_SAMPLE_EDGE, height: MAX_SAMPLE_EDGE };
  const scale = Math.min(1, MAX_SAMPLE_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function containsTransparency(data: Uint8ClampedArray | Uint8Array) {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 254) return true;
  }
  return false;
}

function collectSamples(data: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  const samples: Sample[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] / 255;
      if (alpha < MIN_VISIBLE_ALPHA) continue;
      const rgb = { r: data[index], g: data[index + 1], b: data[index + 2] };
      samples.push({ ...rgb, alpha, x, y, lab: rgbToOklab(rgb) });
    }
  }
  return samples;
}

function runKMeans(samples: Sample[], count: number, seed: number): ClusterResult {
  let centers = seedCenters(samples, count, seed);
  let assignments = new Array<number>(samples.length).fill(0);
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    assignments = samples.map((sample) => findNearestCenter(sample.lab, centers));
    const totals = centers.map(() => ({ l: 0, a: 0, b: 0, weight: 0 }));
    samples.forEach((sample, index) => {
      const total = totals[assignments[index]];
      total.l += sample.lab.l * sample.alpha;
      total.a += sample.lab.a * sample.alpha;
      total.b += sample.lab.b * sample.alpha;
      total.weight += sample.alpha;
    });
    centers = centers.map((center, index) => {
      const total = totals[index];
      if (total.weight <= 0) return farthestSample(samples, centers).lab;
      return { l: total.l / total.weight, a: total.a / total.weight, b: total.b / total.weight };
    });
  }
  assignments = samples.map((sample) => findNearestCenter(sample.lab, centers));
  return { centers, assignments };
}

function seedCenters(samples: Sample[], count: number, seed: number) {
  const random = createPrng(seed);
  const centers: OklabColor[] = [];
  centers.push(samples[weightedIndex(samples.map((sample) => sample.alpha), random())].lab);
  while (centers.length < count) {
    const weights = samples.map((sample) => {
      const distance = Math.min(...centers.map((center) => oklabDistance(sample.lab, center)));
      return sample.alpha * distance * distance;
    });
    if (weights.reduce((sum, weight) => sum + weight, 0) <= 1e-12) break;
    centers.push(samples[weightedIndex(weights, random())].lab);
  }
  return centers;
}

function findNearestCenter(color: OklabColor, centers: OklabColor[]) {
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  centers.forEach((center, index) => {
    const distance = oklabDistance(color, center);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function farthestSample(samples: Sample[], centers: OklabColor[]) {
  return samples.reduce((farthest, sample) => {
    const distance = Math.min(...centers.map((center) => oklabDistance(sample.lab, center)));
    const farthestDistance = Math.min(...centers.map((center) => oklabDistance(farthest.lab, center)));
    return distance > farthestDistance ? sample : farthest;
  }, samples[0]);
}

function mergeNearbyClusters(result: ClusterResult) {
  const groups: OklabColor[] = [];
  const centerToGroup = result.centers.map((center) => {
    const match = groups.findIndex((candidate) => oklabDistance(center, candidate) < CLUSTER_MERGE_DISTANCE);
    if (match >= 0) return match;
    groups.push(center);
    return groups.length - 1;
  });
  return result.assignments.map((assignment) => centerToGroup[assignment]);
}

function buildRegions(
  samples: Sample[],
  assignments: number[],
  width: number,
  height: number,
  totalAlpha: number,
  globalLab: OklabColor
) {
  const groupCount = Math.max(...assignments) + 1;
  const groups = Array.from({ length: groupCount }, () => [] as number[]);
  assignments.forEach((assignment, index) => groups[assignment].push(index));
  const regions = groups.filter((indices) => indices.length > 0).map((indices) => {
    let alpha = 0;
    let labL = 0;
    let labA = 0;
    let labB = 0;
    let luminance = 0;
    let centroidX = 0;
    let centroidY = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const cells = new Map<number, number>();
    for (const index of indices) {
      const sample = samples[index];
      alpha += sample.alpha;
      labL += sample.lab.l * sample.alpha;
      labA += sample.lab.a * sample.alpha;
      labB += sample.lab.b * sample.alpha;
      luminance += relativeLuminance(sample) * sample.alpha;
      centroidX += ((sample.x + 0.5) / width) * sample.alpha;
      centroidY += ((sample.y + 0.5) / height) * sample.alpha;
      minX = Math.min(minX, sample.x);
      minY = Math.min(minY, sample.y);
      maxX = Math.max(maxX, sample.x + 1);
      maxY = Math.max(maxY, sample.y + 1);
      const cellX = Math.min(SPATIAL_GRID_SIZE - 1, Math.floor((sample.x / width) * SPATIAL_GRID_SIZE));
      const cellY = Math.min(SPATIAL_GRID_SIZE - 1, Math.floor((sample.y / height) * SPATIAL_GRID_SIZE));
      const cellIndex = cellY * SPATIAL_GRID_SIZE + cellX;
      cells.set(cellIndex, (cells.get(cellIndex) ?? 0) + sample.alpha);
    }

    const lab = { l: labL / alpha, a: labA / alpha, b: labB / alpha };
    const lch = oklabToOklch(lab);
    const centroid = { x: centroidX / alpha, y: centroidY / alpha };
    let spread = 0;
    for (const index of indices) {
      const sample = samples[index];
      spread += Math.hypot((sample.x + 0.5) / width - centroid.x, (sample.y + 0.5) / height - centroid.y) * sample.alpha;
    }
    const visibleShare = alpha / totalAlpha;
    const concentration = 1 - clamp01(spread / alpha / 0.55);
    const contrast = clamp01(oklabDistance(lab, globalLab) / 0.25);
    const chromaScore = clamp01(lch.c / 0.24);
    const coverageScore = Math.sqrt(visibleShare);
    const salience = clamp01(0.4 * contrast + 0.25 * chromaScore + 0.2 * concentration + 0.15 * coverageScore);
    const spatialCells = [...cells.entries()].sort(([first], [second]) => first - second).map(([cellIndex, cellAlpha]) => ({
      x: (cellIndex % SPATIAL_GRID_SIZE) / SPATIAL_GRID_SIZE,
      y: Math.floor(cellIndex / SPATIAL_GRID_SIZE) / SPATIAL_GRID_SIZE,
      width: 1 / SPATIAL_GRID_SIZE,
      height: 1 / SPATIAL_GRID_SIZE,
      coverage: cellAlpha / totalAlpha
    }));
    const edgeAlpha = spatialCells
      .filter((cell) => cell.x === 0 || cell.y === 0 || cell.x + cell.width >= 1 || cell.y + cell.height >= 1)
      .reduce((total, cell) => total + cell.coverage, 0);

    return {
      id: "",
      color: rgbToHex(oklabToRgb(lab)),
      area: indices.length / (width * height),
      visibleShare,
      meanAlpha: alpha / indices.length,
      relativeLuminance: luminance / alpha,
      perceptualLightness: lch.l,
      chroma: lch.c,
      hue: lch.c < 0.01 ? null : lch.h,
      salience,
      centroid,
      bounds: { x: minX / width, y: minY / height, width: (maxX - minX) / width, height: (maxY - minY) / height },
      cells: spatialCells,
      lab,
      edgePresence: visibleShare > 0 ? edgeAlpha / visibleShare : 0
    } satisfies RegionWithInternalMetrics;
  });

  return regions
    .sort((first, second) => second.visibleShare - first.visibleShare || second.salience - first.salience || first.color.localeCompare(second.color))
    .map((region, index) => ({ ...region, id: `region-${index + 1}` }));
}

function selectRoles(regions: RegionWithInternalMetrics[]) {
  const base = maxBy(regions, (region) => (
    0.5 * Math.sqrt(region.visibleShare)
    + 0.22 * region.edgePresence
    + 0.18 * (1 - clamp01(region.chroma / 0.2))
    + 0.1 * (1 - Math.abs(region.perceptualLightness - 0.55))
  ));
  // Tiny vivid patches remain eligible for highlights, but cannot displace a
  // materially larger visual subject merely because they have high chroma.
  const subjectFloor = Math.min(0.12, base.visibleShare * 0.35);
  const subjectCandidates = regions.filter((region) => region.visibleShare >= subjectFloor);
  const subject = maxBy(subjectCandidates, (region) => (
    0.52 * region.salience
    + 0.24 * Math.sqrt(region.visibleShare)
    + 0.24 * clamp01(oklabDistance(region.lab, base.lab) / 0.24)
  ));
  const baseRole = regionRole("base", base);
  const subjectRole = regionRole("subject", subject);
  const midpoint = {
    l: (base.lab.l + subject.lab.l) / 2,
    a: (base.lab.a + subject.lab.a) / 2,
    b: (base.lab.b + subject.lab.b) / 2
  };
  const transitionCandidate = maxBy(regions, (region) => (
    0.7 * (1 - clamp01(oklabDistance(region.lab, midpoint) / 0.22)) + 0.3 * Math.sqrt(region.visibleShare)
  ));
  const baseSubjectDistance = oklabDistance(base.lab, subject.lab);
  const useRegionTransition = transitionCandidate.id !== base.id
    && transitionCandidate.id !== subject.id
    && oklabDistance(transitionCandidate.lab, midpoint) <= Math.max(0.045, baseSubjectDistance * 0.55);
  const transition: PaletteRoleReference = useRegionTransition
    ? regionRole("transition", transitionCandidate)
    : {
        role: "transition",
        color: rgbToHex(oklabToRgb(midpoint)),
        source: "perceptual-mix",
        anchor: { x: (base.centroid.x + subject.centroid.x) / 2, y: (base.centroid.y + subject.centroid.y) / 2 }
      };
  const highlights = regions
    .filter((region) => region.id !== base.id && region.id !== subject.id)
    .map((region) => ({
      region,
      score: 0.42 * region.salience
        + 0.34 * clamp01(region.chroma / 0.22)
        + 0.24 * clamp01(Math.abs(region.perceptualLightness - base.perceptualLightness) / 0.45)
    }))
    .filter(({ region, score }) => score >= 0.32 && (region.chroma >= 0.035 || region.visibleShare >= 0.08))
    .sort((first, second) => second.score - first.score || first.region.id.localeCompare(second.region.id))
    .slice(0, 2)
    .map(({ region }) => regionRole("highlight", region));
  if (highlights.length === 0) {
    const target = rgbToOklab(subject.perceptualLightness < 0.65
      ? { r: 255, g: 255, b: 255 }
      : { r: 0, g: 0, b: 0 });
    const amount = 0.18;
    highlights.push({
      role: "highlight",
      color: rgbToHex(oklabToRgb({
        l: subject.lab.l + (target.l - subject.lab.l) * amount,
        a: subject.lab.a + (target.a - subject.lab.a) * amount,
        b: subject.lab.b + (target.b - subject.lab.b) * amount
      })),
      source: "perceptual-mix",
      anchor: subject.centroid
    });
  }
  return { base: baseRole, subject: subjectRole, transition, highlights };
}

function regionRole(role: PaletteRoleReference["role"], region: RegionWithInternalMetrics): PaletteRoleReference {
  return { role, color: region.color, regionId: region.id, source: "region", anchor: region.centroid };
}

function calculateMetrics(samples: Sample[], totalAlpha: number) {
  let luminance = 0;
  let saturation = 0;
  let hueX = 0;
  let hueY = 0;
  let hueWeight = 0;
  for (const sample of samples) {
    luminance += relativeLuminance(sample) * sample.alpha;
    saturation += rgbToHsl(sample).s * sample.alpha;
    const lch = oklabToOklch(sample.lab);
    if (lch.c >= 0.01) {
      const weight = sample.alpha * lch.c;
      const radians = (lch.h * Math.PI) / 180;
      hueX += Math.cos(radians) * weight;
      hueY += Math.sin(radians) * weight;
      hueWeight += weight;
    }
  }
  return {
    averageLuminance: luminance / totalAlpha,
    averageSaturation: saturation / totalAlpha,
    hueVariance: hueWeight > 0 ? 1 - Math.min(1, Math.hypot(hueX, hueY) / hueWeight) : 0
  };
}

function classifyPalette(regions: RegionWithInternalMetrics[], averageSaturation: number, hueVariance: number) {
  const maxChroma = Math.max(...regions.map((region) => region.chroma));
  const meaningfulColors = regions.filter((region) => region.visibleShare >= 0.025).length;
  if (maxChroma < 0.025 && averageSaturation < 0.1) return "neutral" as const;
  if (hueVariance < 0.025 && meaningfulColors <= 3) return "monochrome" as const;
  if (hueVariance >= 0.08 && meaningfulColors >= 3) return "colorful" as const;
  return "low-variance" as const;
}

function fallbackPaletteWithAnalysis(input: Omit<CoverPaletteAnalysis, "version" | "roles">): ExtractedPalette {
  const center = { x: 0.5, y: 0.5 };
  return {
    ...DEFAULT_PALETTE,
    colors: [...DEFAULT_PALETTE.colors],
    analysis: {
      version: 1,
      ...input,
      roles: {
        base: { role: "base", color: DEFAULT_PALETTE.dark, source: "perceptual-mix", anchor: center },
        subject: { role: "subject", color: DEFAULT_PALETTE.primary, source: "perceptual-mix", anchor: center },
        transition: { role: "transition", color: DEFAULT_PALETTE.secondary ?? DEFAULT_PALETTE.primary, source: "perceptual-mix", anchor: center },
        highlights: [{ role: "highlight", color: DEFAULT_PALETTE.accent ?? DEFAULT_PALETTE.primary, source: "perceptual-mix", anchor: center }]
      }
    }
  };
}

function stripInternalMetrics(region: RegionWithInternalMetrics): PaletteRegionAnalysis {
  const publicRegion: Partial<RegionWithInternalMetrics> = { ...region };
  delete publicRegion.lab;
  delete publicRegion.edgePresence;
  return publicRegion as PaletteRegionAnalysis;
}

function weightedMeanLab(samples: Sample[]) {
  const total = samples.reduce((sum, sample) => sum + sample.alpha, 0);
  return samples.reduce((mean, sample) => ({
    l: mean.l + sample.lab.l * sample.alpha / total,
    a: mean.a + sample.lab.a * sample.alpha / total,
    b: mean.b + sample.lab.b * sample.alpha / total
  }), { l: 0, a: 0, b: 0 });
}

function farthestRegionColor(regions: RegionWithInternalMetrics[], regionId?: string) {
  const source = regions.find((region) => region.id === regionId) ?? regions[0];
  if (!source) return undefined;
  return [...regions]
    .filter((region) => region.id !== source.id)
    .sort((first, second) => oklabDistance(second.lab, source.lab) - oklabDistance(first.lab, source.lab))[0]?.color;
}

function colorFromOklch(color: { l: number; c: number; h: number }) {
  return rgbToHex(oklabToRgb(oklchToOklab(color)));
}

function uniqueColors(colors: string[]) {
  return colors.filter((color, index) => colors.findIndex((candidate) => candidate.toUpperCase() === color.toUpperCase()) === index);
}

function maxBy<T>(items: T[], score: (item: T) => number) {
  return items.reduce((best, item) => score(item) > score(best) ? item : best, items[0]);
}

function weightedIndex(weights: number[], position: number) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = position * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return index;
  }
  return weights.length - 1;
}

function createPrng(seed: number) {
  let state = seed || 0x9E3779B9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function hashPixels(data: Uint8ClampedArray | Uint8Array, width: number, height: number, sourceWidth: number, sourceHeight: number) {
  let hash = 0x811C9DC5;
  for (const value of [width, height, sourceWidth, sourceHeight]) {
    hash ^= value & 0xFF;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (value >>> 8) & 0xFF;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (value >>> 16) & 0xFF;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (value >>> 24) & 0xFF;
    hash = Math.imul(hash, 0x01000193);
  }
  for (const channel of data) {
    hash ^= channel;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function assertPixelBuffer(data: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("Palette sample dimensions must be positive integers.");
  }
  if (data.length !== width * height * 4) {
    throw new RangeError("Palette sample must contain exactly width * height RGBA channels.");
  }
}

function positiveDimension(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value! > 0 ? Math.round(value!) : fallback;
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function loadImage(src: string, timeoutMs = COVER_IMAGE_ANALYSIS_TIMEOUT_MS) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => {
      cleanup();
      image.src = "data:,";
      reject(new Error("Cover image analysis timed out."));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
    };
    image.crossOrigin = "anonymous";
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("Unable to load cover image for palette extraction."));
    };
    image.src = src;
  });
}
