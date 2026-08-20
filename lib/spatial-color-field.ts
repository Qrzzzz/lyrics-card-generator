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
  familyId: string | null;
};

export type ColorFieldFamily = {
  id: string;
  weight: number;
  sourceColors: string[];
};

export type ColorFieldPlan = {
  width: number;
  height: number;
  aspect: number;
  topology: "square" | "portrait" | "tall" | "landscape" | "ultrawide";
  seed: number;
  baseColor: string;
  families: ColorFieldFamily[];
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
  familyId: string | null;
  spatialSpread: { x: number; y: number } | null;
  preferredColor: string | null;
  colorChoices: string[];
};

type PreparedColor = { source: string; field: string };
type ColorFamily = ColorFieldFamily & {
  centroid: Point;
  spread: { x: number; y: number } | null;
  regions: Array<SpatialPaletteContract["regions"][number] & { fieldColor: string }>;
  fieldColors: string[];
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
  // Absolute output size changes mesh density, not the semantic composition.
  // Keeping the seed aspect-bound prevents 1080x1080 and 2160x2160 exports
  // from reshuffling source color roles.
  const seed = hashString(`${adapted.signature}|aspect:${aspect.toFixed(6)}|${topology}`);
  const random = mulberry32(seed);
  const longSpan = Math.max(aspect, 1 / aspect);
  const targetCount = clamp(Math.round(6 + longSpan * 1.55), 8, 16);
  const preparedColors = prepareFieldColors(adapted);
  const colors = preparedColors.map(({ field }) => field);
  const families = buildColorFamilies(adapted.regions, preparedColors);
  const points = generateAnchorPoints(targetCount, aspect, families, random);
  const localEnergies = points.map((point, index) => {
    const edgeScale = point.edge ? 0.82 : 1;
    return edgeScale * (0.88 + random() * 0.24) * (index % 3 === 0 ? 1.04 : 1);
  });
  const rawEnergies = allocateFamilyEnergies(points, localEnergies, families);
  const energyTotal = rawEnergies.reduce((sum, energy) => sum + energy, 0);
  const seedAngle = random() * 180;
  const anchors: ColorFieldAnchor[] = [];

  points.forEach((point, index) => {
    const nearby = anchors.filter((anchor) => isotropicDistance(point, anchor, aspect) < 1.45);
    // Spatial plans optimize separation only inside the source family already
    // allocated to this anchor. Fallback palettes retain the legacy global set.
    const color = chooseSeparatedColor(
      point.colorChoices.length > 0 ? point.colorChoices : colors,
      nearby,
      point,
      aspect,
      point.preferredColor,
      index,
      random
    );
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
      edge: point.edge,
      familyId: point.familyId
    });
  });

  return {
    width: safeWidth,
    height: safeHeight,
    aspect,
    topology,
    seed,
    baseColor: mixColors(adapted.dark, "#05060A", 0.38),
    families: families.map(({ id, weight, sourceColors }) => ({ id, weight, sourceColors })),
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
        // Preserve the extractor's actual area budget. Raising a tiny region
        // to one percent here would reintroduce the accent-expansion bug.
        weight: clamp(region.weight, Number.EPSILON, 1),
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
  return palette.colors.slice(0, 8).map((color, index): PreparedColor => {
    const source = rgbToHsl(hexToRgb(color));
    // Compress global luminance energy without deciding the lyric safe area's
    // final local contrast (owned by the downstream readability pass).
    const lightness = colorful
      ? 0.27 + clamp(source.l, 0.08, 0.92) * 0.18
      : 0.25 + clamp(source.l, 0.08, 0.92) * 0.12;
    const saturationScale = colorful ? (index % 2 === 0 ? 0.94 : 0.86) : 0.58;
    return {
      source: color,
      field: adjustLightness(color, lightness, saturationScale)
    };
  });
}

function buildColorFamilies(
  regions: SpatialPaletteContract["regions"],
  preparedColors: PreparedColor[]
): ColorFamily[] {
  if (regions.length === 0) return [];
  const preparedBySource = new Map(preparedColors.map((color) => [color.source, color.field]));
  const grouped = new Map<string, Array<SpatialPaletteContract["regions"][number] & { fieldColor: string }>>();

  for (const region of regions) {
    const key = sourceColorFamily(region.color);
    const members = grouped.get(key) ?? [];
    members.push({
      ...region,
      fieldColor: preparedBySource.get(region.color) ?? adjustLightness(region.color, 0.34, 0.9)
    });
    grouped.set(key, members);
  }

  const totalWeight = regions.reduce((sum, region) => sum + region.weight, 0);
  return [...grouped.entries()]
    .map(([key, members]) => {
      const rawWeight = members.reduce((sum, region) => sum + region.weight, 0);
      const centroid = members.reduce((point, region) => ({
        x: point.x + region.centroid.x * region.weight / rawWeight,
        y: point.y + region.centroid.y * region.weight / rawWeight
      }), { x: 0, y: 0 });
      const spreadMembers = members.filter((region) => region.spread);
      const spreadWeight = spreadMembers.reduce((sum, region) => sum + region.weight, 0);
      const spread = spreadWeight > 0
        ? spreadMembers.reduce((value, region) => ({
          x: value.x + (region.spread?.x ?? 0) * region.weight / spreadWeight,
          y: value.y + (region.spread?.y ?? 0) * region.weight / spreadWeight
        }), { x: 0, y: 0 })
        : null;
      return {
        id: `source-family-${key}`,
        weight: rawWeight / totalWeight,
        sourceColors: uniqueColors(members.map((region) => region.color)),
        centroid,
        spread,
        regions: members,
        fieldColors: uniqueColors(members.map((region) => region.fieldColor))
      };
    })
    .sort((first, second) => second.weight - first.weight || first.id.localeCompare(second.id));
}

function sourceColorFamily(color: string) {
  const { h, s } = rgbToHsl(hexToRgb(color));
  if (s < 0.1) return "neutral";
  if (h < 100 || h >= 300) return "warm";
  if (h >= 150 && h < 300) return "cool";
  return "green";
}

function allocateFamilyCounts(families: ColorFamily[], count: number) {
  if (families.length === 0) return [];
  const exact = families.map((family) => family.weight * count);
  const counts = exact.map(Math.floor);
  const remaining = count - counts.reduce((sum, value) => sum + value, 0);
  const remainderOrder = families
    .map((family, index) => ({ index, remainder: exact[index] - counts[index], weight: family.weight }))
    .sort((first, second) => second.remainder - first.remainder || second.weight - first.weight || first.index - second.index);
  for (let index = 0; index < remaining; index += 1) counts[remainderOrder[index % remainderOrder.length].index] += 1;
  return counts;
}

function createFamilySchedule(families: ColorFamily[], count: number) {
  const counts = allocateFamilyCounts(families, count);
  const used = counts.map(() => 0);
  const schedule: Array<ColorFamily | undefined> = [];

  for (let slot = 0; slot < count; slot += 1) {
    let selected = -1;
    let largestDeficit = Number.NEGATIVE_INFINITY;
    counts.forEach((familyCount, index) => {
      if (used[index] >= familyCount) return;
      const deficit = familyCount * (slot + 1) / count - used[index];
      if (deficit > largestDeficit) {
        largestDeficit = deficit;
        selected = index;
      }
    });
    if (selected < 0) break;
    used[selected] += 1;
    schedule.push(families[selected]);
  }
  return schedule;
}

function allocateFamilyEnergies(points: AnchorPoint[], localEnergies: number[], families: ColorFamily[]) {
  if (families.length === 0) return localEnergies;
  const represented = families.filter((family) => points.some((point) => point.familyId === family.id));
  const representedWeight = represented.reduce((sum, family) => sum + family.weight, 0);
  const localTotals = new Map<string, number>();
  points.forEach((point, index) => {
    if (!point.familyId) return;
    localTotals.set(point.familyId, (localTotals.get(point.familyId) ?? 0) + localEnergies[index]);
  });

  return points.map((point, index) => {
    const family = represented.find((candidate) => candidate.id === point.familyId);
    if (!family) return 0;
    return family.weight / representedWeight * localEnergies[index] / (localTotals.get(family.id) ?? 1);
  });
}

function generateAnchorPoints(
  count: number,
  aspect: number,
  families: ColorFamily[],
  random: () => number
) {
  const schedule = createFamilySchedule(families, count);
  const edgePoints: Array<Point & { edge: NonNullable<ColorFieldAnchor["edge"]> }> = [
    { x: 0.22 + random() * 0.56, y: -0.055, edge: "top" },
    { x: 1.055, y: 0.22 + random() * 0.56, edge: "right" },
    { x: 0.22 + random() * 0.56, y: 1.055, edge: "bottom" },
    { x: -0.055, y: 0.22 + random() * 0.56, edge: "left" }
  ];
  const points: AnchorPoint[] = edgePoints.map((point, index) =>
    sourceBoundPoint(point, schedule[index])
  );
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
      const family = schedule[index + edgePoints.length];

      if (family) {
        const regionLong = isHorizontal ? family.centroid.x : family.centroid.y;
        const regionShort = isHorizontal ? family.centroid.y : family.centroid.x;
        const influence = 0.22 + family.weight * 0.2;
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

      const candidate = sourceBoundPoint(
        isHorizontal ? { x: long, y: short, edge: null } : { x: short, y: long, edge: null },
        family
      );
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
      const family = schedule[index + edgePoints.length];
      let farthestDistance = -1;
      for (let attempt = 0; attempt < 64; attempt += 1) {
        const long = (index + 0.12 + random() * 0.76) / interiorCount;
        const short = 0.12 + random() * 0.76;
        const candidate = sourceBoundPoint(
          isHorizontal ? { x: long, y: short, edge: null } : { x: short, y: long, edge: null },
          family
        );
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

function sourceBoundPoint(
  point: Point & { edge: ColorFieldAnchor["edge"] },
  family?: ColorFamily
): AnchorPoint {
  if (!family) {
    return {
      ...point,
      familyId: null,
      spatialSpread: null,
      preferredColor: null,
      colorChoices: []
    };
  }
  const nearestRegion = [...family.regions].sort((first, second) =>
    Math.hypot(first.centroid.x - point.x, first.centroid.y - point.y) -
    Math.hypot(second.centroid.x - point.x, second.centroid.y - point.y)
  )[0];
  return {
    ...point,
    familyId: family.id,
    spatialSpread: family.spread,
    preferredColor: nearestRegion?.fieldColor ?? family.fieldColors[0] ?? null,
    colorChoices: family.fieldColors
  };
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
