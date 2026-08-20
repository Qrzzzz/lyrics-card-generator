import type { ExtractedPalette } from "@/lib/types";
import {
  DEFAULT_PALETTE,
  adjustLightness,
  hexToRgb,
  mixColors,
  normalizeHex,
  rgbToHex,
  rgbToHsl,
  type RgbColor
} from "@/lib/palette-background";

/**
 * Minimal adapter contract for the spatial palette extractor owned upstream.
 * Coordinates and spread are normalized to the decoded cover, not the card.
 */
export type SpatialPaletteContract = {
  version: 1;
  coverSignature: string;
  regions: Array<{
    color: string;
    weight: number;
    centroid: { x: number; y: number };
    spread?: { x: number; y: number };
  }>;
};

export type ColorFieldAnchor = {
  id: string;
  x: number;
  y: number;
  color: string;
  energy: number;
  radiusMajor: number;
  radiusMinor: number;
  angle: number;
  curvature: number;
  edge: "top" | "right" | "bottom" | "left" | null;
};

export type ColorFieldPlan = {
  width: number;
  height: number;
  aspect: number;
  topology: "square" | "portrait" | "tall" | "landscape" | "ultrawide";
  seed: number;
  baseColor: string;
  anchors: ColorFieldAnchor[];
};

export type ColorFieldCell = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type ColorFieldMesh = {
  viewWidth: number;
  viewHeight: number;
  cellSize: number;
  blur: number;
  columns: number;
  rows: number;
  cells: ColorFieldCell[];
};

type AdaptedPalette = {
  signature: string;
  colors: string[];
  regions: SpatialPaletteContract["regions"];
  dark: string;
  kind: ExtractedPalette["kind"];
};

type Point = { x: number; y: number };
type AnchorPoint = Point & {
  edge: ColorFieldAnchor["edge"];
  spatialWeight: number;
  spatialSpread: { x: number; y: number } | null;
  preferredColor: string | null;
};

const GOLDEN_ANGLE = 137.50776405003785;
const MIN_ANCHOR_SPACING = 0.38;
const MAX_MESH_CELLS = 520;
const TARGET_CELL_SIZE = 118;

export function createColorFieldPlan({
  width,
  height,
  palette = DEFAULT_PALETTE,
  spatialPalette
}: {
  width: number;
  height: number;
  palette?: ExtractedPalette;
  spatialPalette?: SpatialPaletteContract;
}): ColorFieldPlan {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const aspect = safeWidth / safeHeight;
  const topology = resolveTopology(aspect);
  const adapted = adaptSpatialPalette(palette, spatialPalette);
  const seed = hashString(`${adapted.signature}|${safeWidth}x${safeHeight}|${topology}`);
  const random = mulberry32(seed);
  const longSpan = Math.max(aspect, 1 / aspect);
  const targetCount = clamp(Math.round(6 + longSpan * 1.55), 8, 16);
  const points = generateAnchorPoints(targetCount, aspect, adapted.regions, random);
  const colors = prepareFieldColors(adapted);
  const rawEnergies = points.map((point, index) => {
    const edgeScale = point.edge ? 0.82 : 1;
    const spatialScale = 0.9 + point.spatialWeight * 0.2;
    return edgeScale * spatialScale * (0.76 + random() * 0.48) * (index % 3 === 0 ? 1.08 : 1);
  });
  const energyTotal = rawEnergies.reduce((sum, energy) => sum + energy, 0);
  const seedAngle = random() * 180;
  const anchors: ColorFieldAnchor[] = [];

  points.forEach((point, index) => {
    const nearby = anchors.filter((anchor) => isotropicDistance(point, anchor, aspect) < 1.45);
    const color = chooseSeparatedColor(colors, nearby, point, aspect, point.preferredColor, index, random);
    const angle = chooseFlowAngle(seedAngle + index * GOLDEN_ANGLE + (random() - 0.5) * 20, nearby);
    const localSpacing = nearestPointDistance(point, points, index, aspect);
    const spreadAlong = point.spatialSpread
      ? (aspect >= 1 ? point.spatialSpread.x : point.spatialSpread.y)
      : 0.22;
    const spreadAcross = point.spatialSpread
      ? (aspect >= 1 ? point.spatialSpread.y : point.spatialSpread.x)
      : 0.18;
    // Long, overlapping supports let color flow out to another anchor or edge;
    // a compact circular support would recreate a closed radial-gradient blob.
    const major = clamp(0.82 + localSpacing * 0.46 + spreadAlong * 0.18 + random() * 0.24, 0.94, 1.46);
    const minor = clamp(major * (0.43 + spreadAcross * 0.14 + random() * 0.1), 0.47, 0.79);
    const curvatureSign = index % 4 === 0 || index % 4 === 1 ? 1 : -1;

    anchors.push({
      id: `field-anchor-${index}`,
      x: point.x,
      y: point.y,
      color,
      energy: rawEnergies[index] / energyTotal,
      radiusMajor: major,
      radiusMinor: minor,
      angle,
      curvature: curvatureSign * (0.07 + random() * 0.15),
      edge: point.edge
    });
  });

  return {
    width: safeWidth,
    height: safeHeight,
    aspect,
    topology,
    seed,
    baseColor: mixColors(adapted.dark, "#05060A", 0.38),
    anchors
  };
}

export function createColorFieldMesh(plan: ColorFieldPlan): ColorFieldMesh {
  const minDimension = Math.min(plan.width, plan.height);
  const viewWidth = (plan.width / minDimension) * 1000;
  const viewHeight = (plan.height / minDimension) * 1000;
  let columns = Math.max(9, Math.ceil(viewWidth / TARGET_CELL_SIZE));
  let rows = Math.max(9, Math.ceil(viewHeight / TARGET_CELL_SIZE));

  if ((columns + 2) * (rows + 2) > MAX_MESH_CELLS) {
    const scale = Math.sqrt(MAX_MESH_CELLS / ((columns + 2) * (rows + 2)));
    columns = Math.max(7, Math.floor(columns * scale));
    rows = Math.max(7, Math.floor(rows * scale));
  }

  while ((columns + 2) * (rows + 2) > MAX_MESH_CELLS) {
    if (columns >= rows && columns > 7) columns -= 1;
    else if (rows > 7) rows -= 1;
    else break;
  }

  const cellWidth = viewWidth / columns;
  const cellHeight = viewHeight / rows;
  const cellSize = Math.max(cellWidth, cellHeight);
  const overscan = 1;
  const cells: ColorFieldCell[] = [];

  for (let row = -overscan; row < rows + overscan; row += 1) {
    for (let column = -overscan; column < columns + overscan; column += 1) {
      const centerX = (column + 0.5) / columns;
      const centerY = (row + 0.5) / rows;
      cells.push({
        key: `${column}:${row}`,
        x: column * cellWidth,
        y: row * cellHeight,
        width: cellWidth + 0.75,
        height: cellHeight + 0.75,
        color: sampleColorField(plan, centerX, centerY)
      });
    }
  }

  return {
    viewWidth,
    viewHeight,
    cellSize,
    blur: cellSize * 0.72,
    columns,
    rows,
    cells
  };
}

/** Samples one continuous, normalized Shepard field; the SVG mesh is only its bounded carrier. */
export function sampleColorField(plan: ColorFieldPlan, x: number, y: number) {
  const base = hexToRgb(plan.baseColor);
  let red = base.r * 0.09;
  let green = base.g * 0.09;
  let blue = base.b * 0.09;
  let totalWeight = 0.09;

  for (const anchor of plan.anchors) {
    const { dx, dy } = isotropicDelta({ x, y }, anchor, plan.aspect);
    const radians = (anchor.angle * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const along = dx * cosine + dy * sine;
    const across = -dx * sine + dy * cosine;
    const curvedAcross = across + anchor.curvature * along * along;
    const distance =
      (along * along) / (anchor.radiusMajor * anchor.radiusMajor) +
      (curvedAcross * curvedAcross) / (anchor.radiusMinor * anchor.radiusMinor);
    const weight = anchor.energy / Math.pow(0.16 + distance, 1.36);
    const color = hexToRgb(anchor.color);

    red += color.r * weight;
    green += color.g * weight;
    blue += color.b * weight;
    totalWeight += weight;
  }

  const edgeDistance = Math.min(clamp01(x), clamp01(y), clamp01(1 - x), clamp01(1 - y));
  const edgeShade = 0.88 + Math.min(0.12, edgeDistance * 0.48);
  const verticalShade = 1 - clamp01(y) * 0.075;

  return rgbToHex({
    r: (red / totalWeight) * edgeShade * verticalShade,
    g: (green / totalWeight) * edgeShade * verticalShade,
    b: (blue / totalWeight) * edgeShade * verticalShade
  });
}

export function isotropicAnchorDistance(a: Point, b: Point, aspect: number) {
  return isotropicDistance(a, b, aspect);
}

export function colorDistanceOklab(a: string, b: string) {
  const first = rgbToOklab(hexToRgb(a));
  const second = rgbToOklab(hexToRgb(b));
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
}

function adaptSpatialPalette(
  palette: ExtractedPalette,
  spatialPalette?: SpatialPaletteContract
): AdaptedPalette {
  const extractedSpatialPalette: SpatialPaletteContract | undefined = palette.analysis?.version === 1
    ? {
        version: 1,
        coverSignature: palette.analysis.seed,
        regions: palette.analysis.regions.map((region) => ({
          color: region.color,
          weight: region.visibleShare,
          centroid: region.centroid,
          spread: {
            x: region.bounds.width,
            y: region.bounds.height
          }
        }))
      }
    : undefined;
  const activeSpatialPalette = spatialPalette ?? extractedSpatialPalette;
  const fallbackColors = [
    palette.primary,
    palette.secondary,
    palette.accent,
    ...palette.colors,
    palette.muted,
    palette.light
  ].filter((color): color is string => typeof color === "string");
  const validRegions = activeSpatialPalette?.version === 1
    ? activeSpatialPalette.regions
      .filter((region) => Number.isFinite(region.weight) && region.weight > 0)
      .map((region) => ({
        ...region,
        color: normalizeHex(region.color),
        weight: clamp(region.weight, 0.01, 1),
        centroid: {
          x: clamp01(region.centroid.x),
          y: clamp01(region.centroid.y)
        },
        spread: region.spread
          ? { x: clamp01(region.spread.x), y: clamp01(region.spread.y) }
          : undefined
      }))
    : [];
  const colors = uniqueColors([
    ...validRegions.map((region) => region.color),
    ...fallbackColors.map(normalizeHex)
  ]);
  const fallbackSignature = [
    ...colors,
    palette.averageLuminance.toFixed(4),
    palette.averageSaturation.toFixed(4),
    palette.hueVariance.toFixed(4),
    palette.kind
  ].join("|");

  return {
    signature: activeSpatialPalette?.coverSignature.trim() || fallbackSignature,
    colors,
    regions: validRegions,
    dark: normalizeHex(palette.dark),
    kind: palette.kind
  };
}

function prepareFieldColors(palette: AdaptedPalette) {
  const colorful = palette.kind === "colorful";
  return palette.colors.slice(0, 8).map((color, index) => {
    const source = rgbToHsl(hexToRgb(color));
    // Compress global luminance energy without deciding the lyric safe area's
    // final local contrast (owned by the downstream readability pass).
    const lightness = colorful
      ? 0.27 + clamp(source.l, 0.08, 0.92) * 0.18
      : 0.25 + clamp(source.l, 0.08, 0.92) * 0.12;
    const saturationScale = colorful ? (index % 2 === 0 ? 0.94 : 0.86) : 0.58;
    return adjustLightness(color, lightness, saturationScale);
  });
}

function generateAnchorPoints(
  count: number,
  aspect: number,
  regions: SpatialPaletteContract["regions"],
  random: () => number
) {
  const points: AnchorPoint[] = [
    { x: 0.22 + random() * 0.56, y: -0.055, edge: "top", spatialWeight: 0, spatialSpread: null, preferredColor: null },
    { x: 1.055, y: 0.22 + random() * 0.56, edge: "right", spatialWeight: 0, spatialSpread: null, preferredColor: null },
    { x: 0.22 + random() * 0.56, y: 1.055, edge: "bottom", spatialWeight: 0, spatialSpread: null, preferredColor: null },
    { x: -0.055, y: 0.22 + random() * 0.56, edge: "left", spatialWeight: 0, spatialSpread: null, preferredColor: null }
  ];
  const isHorizontal = aspect >= 1;
  const interiorCount = count - points.length;
  let alternatingTurns = 0;
  let previousDeltaSign = 0;
  let previousShort = 0.5;

  for (let index = 0; index < interiorCount; index += 1) {
    let accepted: AnchorPoint | undefined;

    for (let attempt = 0; attempt < 48; attempt += 1) {
      let long = (index + 0.23 + random() * 0.54) / interiorCount;
      let short = 0.1 + random() * 0.8;
      const region = regions.length > 0 ? regions[index % regions.length] : undefined;

      if (region) {
        const regionLong = isHorizontal ? region.centroid.x : region.centroid.y;
        const regionShort = isHorizontal ? region.centroid.y : region.centroid.x;
        const influence = 0.22 + region.weight * 0.2;
        long = long * (1 - influence * 0.35) + regionLong * influence * 0.35;
        short = short * (1 - influence) + regionShort * influence;
      }

      let deltaSign = Math.sign(short - previousShort);
      let nextAlternatingTurns =
        deltaSign !== 0 && previousDeltaSign !== 0 && deltaSign !== previousDeltaSign
          ? alternatingTurns + 1
          : 0;
      if (nextAlternatingTurns >= 3) {
        short = clamp01(previousShort + (random() - 0.35) * 0.28);
        deltaSign = Math.sign(short - previousShort);
        nextAlternatingTurns = 0;
      }

      const candidate = isHorizontal
        ? {
          x: long,
          y: short,
          edge: null,
          spatialWeight: region?.weight ?? 0,
          spatialSpread: region?.spread ?? null,
          preferredColor: region?.color ?? null
        }
        : {
          x: short,
          y: long,
          edge: null,
          spatialWeight: region?.weight ?? 0,
          spatialSpread: region?.spread ?? null,
          preferredColor: region?.color ?? null
        };
      const threshold = MIN_ANCHOR_SPACING * Math.max(0.72, 1 - attempt / 80);

      if (points.every((point) => isotropicDistance(candidate, point, aspect) >= threshold)) {
        accepted = candidate;
        previousShort = short;
        previousDeltaSign = deltaSign;
        alternatingTurns = nextAlternatingTurns;
        break;
      }
    }

    if (!accepted) {
      const region = regions.length > 0 ? regions[index % regions.length] : undefined;
      let farthestDistance = -1;
      for (let attempt = 0; attempt < 64; attempt += 1) {
        const long = (index + 0.12 + random() * 0.76) / interiorCount;
        const short = 0.12 + random() * 0.76;
        const candidate: AnchorPoint = isHorizontal
          ? {
            x: long,
            y: short,
            edge: null,
            spatialWeight: region?.weight ?? 0,
            spatialSpread: region?.spread ?? null,
            preferredColor: region?.color ?? null
          }
          : {
            x: short,
            y: long,
            edge: null,
            spatialWeight: region?.weight ?? 0,
            spatialSpread: region?.spread ?? null,
            preferredColor: region?.color ?? null
          };
        const distance = Math.min(...points.map((point) => isotropicDistance(candidate, point, aspect)));
        if (distance > farthestDistance) {
          accepted = candidate;
          farthestDistance = distance;
        }
      }
    }
    if (!accepted) throw new Error("Unable to place a deterministic color-field anchor.");
    points.push(accepted);
  }

  return points;
}

function chooseSeparatedColor(
  colors: string[],
  neighboringAnchors: ColorFieldAnchor[],
  point: Point,
  aspect: number,
  preferredColor: string | null,
  index: number,
  random: () => number
) {
  if (colors.length === 0) return "#111827";
  if (neighboringAnchors.length === 0) return colors[index % colors.length];

  const offset = Math.floor(random() * colors.length);
  return [...colors]
    .sort((first, second) => {
      const firstScore = colorPlacementScore(first, neighboringAnchors, point, aspect) +
        preferredColorBonus(first, preferredColor);
      const secondScore = colorPlacementScore(second, neighboringAnchors, point, aspect) +
        preferredColorBonus(second, preferredColor);
      if (secondScore !== firstScore) return secondScore - firstScore;
      return ((colors.indexOf(first) - offset + colors.length) % colors.length) -
        ((colors.indexOf(second) - offset + colors.length) % colors.length);
    })[0];
}

function preferredColorBonus(color: string, preferredColor: string | null) {
  if (!preferredColor) return 0;
  return Math.max(0, 1 - colorDistanceOklab(color, preferredColor) / 0.35) * 0.12;
}

function colorPlacementScore(
  color: string,
  neighboringAnchors: ColorFieldAnchor[],
  point: Point,
  aspect: number
) {
  return neighboringAnchors.reduce((score, anchor) => {
    const distance = isotropicDistance(point, anchor, aspect);
    const separation = colorDistanceOklab(color, anchor.color);
    const proximity = 1 / (0.08 + distance * distance);
    const sameColorPenalty = separation < 0.012 ? proximity * 1.8 : 0;
    return score + separation * proximity - sameColorPenalty;
  }, 0);
}

function chooseFlowAngle(candidate: number, nearby: ColorFieldAnchor[]) {
  let angle = normalizeAngle(candidate);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (nearby.every((anchor) => angleDistance(angle, anchor.angle) >= 24)) return angle;
    angle = normalizeAngle(angle + 31 + attempt * 7);
  }

  return angle;
}

function nearestPointDistance(point: Point, points: Point[], ownIndex: number, aspect: number) {
  let nearest = Number.POSITIVE_INFINITY;
  points.forEach((candidate, index) => {
    if (index === ownIndex) return;
    nearest = Math.min(nearest, isotropicDistance(point, candidate, aspect));
  });
  return Number.isFinite(nearest) ? nearest : 0.8;
}

function isotropicDistance(a: Point, b: Point, aspect: number) {
  const { dx, dy } = isotropicDelta(a, b, aspect);
  return Math.hypot(dx, dy);
}

function isotropicDelta(a: Point, b: Point, aspect: number) {
  return {
    dx: (a.x - b.x) * Math.max(1, aspect),
    dy: (a.y - b.y) * Math.max(1, 1 / aspect)
  };
}

function resolveTopology(aspect: number): ColorFieldPlan["topology"] {
  if (aspect >= 2) return "ultrawide";
  if (aspect > 1.2) return "landscape";
  if (aspect >= 0.82) return "square";
  if (aspect >= 0.48) return "portrait";
  return "tall";
}

function angleDistance(a: number, b: number) {
  const difference = Math.abs(a - b) % 180;
  return Math.min(difference, 180 - difference);
}

function normalizeAngle(angle: number) {
  return ((angle % 180) + 180) % 180;
}

function uniqueColors(colors: string[]) {
  return colors.filter((color, index) => colors.indexOf(color) === index);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function rgbToOklab(rgb: RgbColor) {
  const red = srgbToLinear(rgb.r / 255);
  const green = srgbToLinear(rgb.g / 255);
  const blue = srgbToLinear(rgb.b / 255);
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  };
}

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}
