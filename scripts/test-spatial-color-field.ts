import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  colorDistanceOklab,
  createColorFieldMesh,
  createColorFieldPlan,
  isotropicAnchorDistance,
  sampleColorField,
  type ColorFieldPlan,
  type SpatialPaletteContract
} from "../lib/spatial-color-field";
import { hexToRgb, relativeLuminance, rgbToHsl } from "../lib/palette-background";
import type { ExtractedPalette } from "../lib/types";

const oceanPalette: ExtractedPalette = {
  colors: ["#123B5D", "#1C7C8C", "#D78C56", "#6C4C8B", "#D9D0B4", "#17313B"],
  primary: "#1C7C8C",
  secondary: "#123B5D",
  accent: "#D78C56",
  dark: "#10212A",
  light: "#D9D0B4",
  muted: "#526C70",
  averageLuminance: 0.32,
  averageSaturation: 0.49,
  hueVariance: 0.37,
  isLightCover: false,
  kind: "colorful"
};
const emberPalette: ExtractedPalette = {
  ...oceanPalette,
  colors: ["#4B1628", "#A6372D", "#E2A84A", "#2A1738", "#F2D7B6", "#6F3738"],
  primary: "#A6372D",
  secondary: "#4B1628",
  accent: "#E2A84A",
  dark: "#190F18",
  light: "#F2D7B6",
  muted: "#6F4B50",
  averageLuminance: 0.29,
  averageSaturation: 0.61,
  hueVariance: 0.44
};
const oceanSpatial: SpatialPaletteContract = {
  version: 1,
  coverSignature: "fixture:ocean-cover:sha256-71d9",
  regions: [
    { color: "#1C7C8C", weight: 0.38, centroid: { x: 0.22, y: 0.28 }, spread: { x: 0.2, y: 0.24 } },
    { color: "#D78C56", weight: 0.27, centroid: { x: 0.76, y: 0.36 }, spread: { x: 0.18, y: 0.14 } },
    { color: "#6C4C8B", weight: 0.21, centroid: { x: 0.58, y: 0.8 }, spread: { x: 0.26, y: 0.16 } }
  ]
};

// Checked-in equivalent of the issue #112 failure shape: a cover with 88%
// cool blue mass and a small, high-chroma peach/orange accent.
const dominantBluePalette: ExtractedPalette = {
  colors: ["#456B9B", "#8CA8CC", "#F0A27D", "#1D3157", "#F6C4A8", "#243A62"],
  primary: "#456B9B",
  secondary: "#8CA8CC",
  accent: "#F0A27D",
  dark: "#172844",
  light: "#DCE7F5",
  muted: "#657A98",
  averageLuminance: 0.39,
  averageSaturation: 0.42,
  hueVariance: 0.21,
  isLightCover: false,
  kind: "colorful"
};
const dominantBlueSpatial: SpatialPaletteContract = {
  version: 1,
  coverSignature: "fixture:issue-112:dominant-blue-small-warm-accent",
  regions: [
    { color: "#456B9B", weight: 0.54, centroid: { x: 0.46, y: 0.5 }, spread: { x: 0.82, y: 0.86 } },
    { color: "#1D3157", weight: 0.22, centroid: { x: 0.2, y: 0.44 }, spread: { x: 0.38, y: 0.72 } },
    { color: "#8CA8CC", weight: 0.12, centroid: { x: 0.7, y: 0.7 }, spread: { x: 0.46, y: 0.42 } },
    { color: "#F0A27D", weight: 0.08, centroid: { x: 0.74, y: 0.28 }, spread: { x: 0.2, y: 0.18 } },
    { color: "#F6C4A8", weight: 0.04, centroid: { x: 0.82, y: 0.2 }, spread: { x: 0.1, y: 0.08 } }
  ]
};

const cases = [
  ["1:1", 1080, 1080, "square"],
  ["4:5", 1080, 1350, "portrait"],
  ["9:16", 1080, 1920, "portrait"],
  ["16:9", 1920, 1080, "landscape"],
  ["21:9", 2520, 1080, "ultrawide"],
  ["auto-height", 1080, 6400, "tall"]
] as const;

const plans = new Map<string, ColorFieldPlan>();
for (const [name, width, height, topology] of cases) {
  const first = createColorFieldPlan({ width, height, palette: oceanPalette, spatialPalette: oceanSpatial });
  const second = createColorFieldPlan({ width, height, palette: oceanPalette, spatialPalette: oceanSpatial });
  const mesh = createColorFieldMesh(first);

  assert.deepEqual(first, second, `${name} is completely deterministic`);
  assert.deepEqual(mesh, createColorFieldMesh(second), `${name} mesh is completely deterministic`);
  assert.equal(first.topology, topology, `${name} selects an aspect-specific topology`);
  assert.ok(first.anchors.length >= 8 && first.anchors.length <= 16, `${name} keeps a bounded anchor budget`);
  assert.ok(mesh.cells.length <= 520, `${name} keeps the SVG carrier under its hard node budget`);
  assert.ok(mesh.columns >= 7 && mesh.rows >= 7, `${name} retains two-dimensional field sampling`);
  assertPlanConstraints(first, name);
  assertContinuousSampling(first, name);
  plans.set(name, first);
}

const normalizedLayouts = [...plans.values()].map((plan) =>
  plan.anchors.map((anchor) => `${anchor.x.toFixed(3)},${anchor.y.toFixed(3)}`).join("|")
);
assert.equal(new Set(normalizedLayouts).size, cases.length, "ratios are recomposed instead of stretching one template");

const dominantBlueResults = cases.slice(0, 5).map(([name, width, height]) => {
  const plan = createColorFieldPlan({ width, height, palette: dominantBluePalette, spatialPalette: dominantBlueSpatial });
  assertFamilyBudgets(plan, name);
  const shares = sampleHueFamilyShares(plan, 96);
  const sourceWarmShare = plan.families.find((family) => family.id.endsWith("-warm"))?.weight ?? 0;
  assert.ok(shares.cool > shares.warm, `${name} keeps the dominant cool family ahead of the warm accent (${JSON.stringify(shares)})`);
  assert.ok(
    shares.warm <= sourceWarmShare * 2.25,
    `${name} caps the ${sourceWarmShare.toFixed(3)} warm accent expansion (${shares.warm.toFixed(3)})`
  );
  return { name, plan, shares };
});
const warmShares = dominantBlueResults.map(({ shares }) => shares.warm);
assert.ok(
  Math.max(...warmShares) - Math.min(...warmShares) <= 0.12,
  `source-family roles stay stable across preset ratios (${warmShares.map((share) => share.toFixed(3)).join(", ")})`
);
const dominantBlueSquare = dominantBlueResults[0].plan;
const dominantBlueSquare2x = createColorFieldPlan({
  width: 2160,
  height: 2160,
  palette: dominantBluePalette,
  spatialPalette: dominantBlueSpatial
});
assert.equal(dominantBlueSquare.seed, dominantBlueSquare2x.seed, "same-ratio resolutions share one semantic seed");
assert.deepEqual(dominantBlueSquare.families, dominantBlueSquare2x.families, "same-ratio resolutions preserve family budgets");
assert.deepEqual(dominantBlueSquare.anchors, dominantBlueSquare2x.anchors, "same-ratio resolutions preserve anchor roles and geometry");

const oceanSquare = plans.get("1:1")!;
const emberSquare = createColorFieldPlan({ width: 1080, height: 1080, palette: emberPalette });
assert.notEqual(oceanSquare.seed, emberSquare.seed, "different covers/palettes receive different composition seeds");
assert.notDeepEqual(
  oceanSquare.anchors.map(({ x, y, color }) => ({ x, y, color })),
  emberSquare.anchors.map(({ x, y, color }) => ({ x, y, color })),
  "different covers/palettes produce visibly different anchor compositions"
);
const alternateSignature = createColorFieldPlan({
  width: 1080,
  height: 1080,
  palette: oceanPalette,
  spatialPalette: { ...oceanSpatial, coverSignature: "fixture:ocean-cover:sha256-different" }
});
assert.notEqual(oceanSquare.seed, alternateSignature.seed, "cover identity disambiguates equal aggregate palettes");
assert.notDeepEqual(oceanSquare.anchors, alternateSignature.anchors);
const paletteWithEmbeddedAnalysis: ExtractedPalette = {
  ...oceanPalette,
  analysis: {
    version: 1,
    seed: oceanSpatial.coverSignature,
    sourceWidth: 1200,
    sourceHeight: 1200,
    sampleWidth: 80,
    sampleHeight: 80,
    visibleCoverage: 1,
    meanAlpha: 1,
    regions: oceanSpatial.regions.map((region, index) => ({
      id: `region-${index}`,
      color: region.color,
      area: region.weight,
      visibleShare: region.weight,
      meanAlpha: 1,
      relativeLuminance: relativeLuminance(region.color),
      perceptualLightness: 0.5,
      chroma: 0.1,
      hue: 200,
      salience: region.weight,
      centroid: region.centroid,
      bounds: {
        x: Math.max(0, region.centroid.x - (region.spread?.x ?? 0) / 2),
        y: Math.max(0, region.centroid.y - (region.spread?.y ?? 0) / 2),
        width: region.spread?.x ?? 0,
        height: region.spread?.y ?? 0
      },
      cells: []
    })),
    roles: {
      base: { role: "base", color: oceanPalette.dark, source: "perceptual-mix", anchor: { x: 0.5, y: 0.5 } },
      subject: { role: "subject", color: oceanPalette.primary, source: "region", regionId: "region-0", anchor: oceanSpatial.regions[0].centroid },
      transition: { role: "transition", color: oceanPalette.secondary!, source: "region", regionId: "region-1", anchor: oceanSpatial.regions[1].centroid },
      highlights: [{ role: "highlight", color: oceanPalette.accent!, source: "region", regionId: "region-2", anchor: oceanSpatial.regions[2].centroid }]
    }
  }
};
const embeddedAnalysisPlan = createColorFieldPlan({ width: 1080, height: 1080, palette: paletteWithEmbeddedAnalysis });
assert.deepEqual(
  embeddedAnalysisPlan,
  oceanSquare,
  "the production ExtractedPalette.analysis contract feeds the same deterministic spatial field as the explicit adapter"
);
const movedSpatialRegion = createColorFieldPlan({
  width: 1080,
  height: 1080,
  palette: oceanPalette,
  spatialPalette: {
    ...oceanSpatial,
    regions: oceanSpatial.regions.map((region, index) =>
      index === 0
        ? {
          ...region,
          color: "#E48D4C",
          centroid: { x: 0.82, y: 0.7 },
          spread: { x: 0.64, y: 0.08 },
          weight: 0.7
        }
        : region
    )
  }
});
assert.equal(oceanSquare.seed, movedSpatialRegion.seed, "geometry changes do not masquerade as cover identity changes");
assert.notDeepEqual(
  oceanSquare.anchors,
  movedSpatialRegion.anchors,
  "the adapter consumes upstream centroid, weight, spread, and preferred-color features"
);

const componentSource = readFileSync(resolve("components/preview/PaletteBackground.tsx"), "utf8");
const portraitSource = readFileSync(resolve("components/preview/LyricCard.tsx"), "utf8");
const landscapeSource = readFileSync(resolve("components/preview/LandscapeLyricCard.tsx"), "utf8");
assert.doesNotMatch(componentSource, /radial-gradient/i, "the color field does not fall back to radial blobs");
assert.doesNotMatch(componentSource, /<path\b/i, "the color field does not stack fixed SVG bands");
assert.match(componentSource, /feGaussianBlur/, "the sampled continuous field receives one bounded soft fusion pass");
assert.match(portraitSource, /width=\{size\.width\}/, "portrait cards provide actual field geometry");
assert.match(landscapeSource, /width=\{size\.width\}/, "landscape cards provide actual field geometry");

const benchmarkStart = performance.now();
let generatedCellCount = 0;
for (let index = 0; index < 24; index += 1) {
  for (const [, width, height] of cases) {
    const plan = createColorFieldPlan({ width, height, palette: oceanPalette, spatialPalette: oceanSpatial });
    generatedCellCount += createColorFieldMesh(plan).cells.length;
  }
}
const benchmarkMs = performance.now() - benchmarkStart;
// Wall-clock speed depends on runner load. Keep the measurement diagnostic;
// geometry, cell budgets, and composition invariants above remain blocking.
console.log(
  `Spatial color field tests passed: ${cases.length} geometries, issue #112 warm shares ${warmShares.map((share) => share.toFixed(3)).join("/")}, ${generatedCellCount} benchmark cells in ${benchmarkMs.toFixed(1)}ms.`
);

function assertPlanConstraints(plan: ColorFieldPlan, name: string) {
  const edgeNames = new Set(plan.anchors.map((anchor) => anchor.edge).filter(Boolean));
  assert.deepEqual(edgeNames, new Set(["top", "right", "bottom", "left"]), `${name} covers every edge`);

  const energy = plan.anchors.reduce((sum, anchor) => sum + anchor.energy, 0);
  assert.ok(Math.abs(energy - 1) < 1e-12, `${name} normalizes total energy`);
  assert.ok(Math.max(...plan.anchors.map((anchor) => anchor.energy)) < 0.2, `${name} prevents one dominant hotspot`);

  let nearestSpacing = Number.POSITIVE_INFINITY;
  let nearbyPairs = 0;
  let nearParallelPairs = 0;
  plan.anchors.forEach((anchor, index) => {
    let overlapCount = 0;
    plan.anchors.forEach((other, otherIndex) => {
      if (index === otherIndex) return;
      const distance = isotropicAnchorDistance(anchor, other, plan.aspect);
      nearestSpacing = Math.min(nearestSpacing, distance);
      if (supportsOverlap(anchor, other, plan.aspect, distance)) overlapCount += 1;
      if (otherIndex > index && distance < 1.45) {
        nearbyPairs += 1;
        if (angleDistance(anchor.angle, other.angle) < 12) nearParallelPairs += 1;
        if (distance < 0.82 && (anchor.familyId === null || other.familyId === null || anchor.familyId !== other.familyId)) {
          const colorDistance = colorDistanceOklab(anchor.color, other.color);
          assert.ok(
            colorDistance > 0.025,
            `${name} separates nearest ${anchor.color}/${other.color} anchors (${colorDistance.toFixed(4)} at ${distance.toFixed(3)})`
          );
        }
      }
    });
    assert.ok(overlapCount >= 2, `${name} keeps every support connected so it cannot form an isolated closed island`);
  });
  assert.ok(nearestSpacing >= 0.27, `${name} enforces useful isotropic anchor spacing`);
  assert.ok(nearParallelPairs / Math.max(1, nearbyPairs) < 0.18, `${name} suppresses parallel local flows`);

  const horizontalEnergy = [0, 0];
  const verticalEnergy = [0, 0];
  plan.anchors.forEach((anchor) => {
    horizontalEnergy[anchor.x < 0.5 ? 0 : 1] += anchor.energy;
    verticalEnergy[anchor.y < 0.5 ? 0 : 1] += anchor.energy;
  });
  assert.ok(Math.min(...horizontalEnergy) > 0.16, `${name} balances energy across left/right`);
  assert.ok(Math.min(...verticalEnergy) > 0.16, `${name} balances energy across top/bottom`);

  const interior = plan.anchors.filter((anchor) => anchor.edge === null);
  const shortAxis = interior.map((anchor) => plan.aspect >= 1 ? anchor.y : anchor.x);
  let alternatingRun = 0;
  let longestAlternatingRun = 0;
  let previousSign = 0;
  for (let index = 1; index < shortAxis.length; index += 1) {
    const sign = Math.sign(shortAxis[index] - shortAxis[index - 1]);
    alternatingRun = sign !== 0 && previousSign !== 0 && sign !== previousSign ? alternatingRun + 1 : 0;
    longestAlternatingRun = Math.max(longestAlternatingRun, alternatingRun);
    previousSign = sign;
  }
  assert.ok(longestAlternatingRun < 3, `${name} breaks repeated S-curve alternation`);
}

function assertFamilyBudgets(plan: ColorFieldPlan, name: string) {
  assert.ok(plan.families.length >= 2, `${name} exposes source-derived color families`);
  for (const family of plan.families) {
    const anchors = plan.anchors.filter((anchor) => anchor.familyId === family.id);
    const countShare = anchors.length / plan.anchors.length;
    const energyShare = anchors.reduce((sum, anchor) => sum + anchor.energy, 0);
    assert.ok(
      Math.abs(countShare - family.weight) <= 1 / plan.anchors.length + 1e-12,
      `${name}/${family.id} keeps anchor count within one slot of source share`
    );
    assert.ok(
      Math.abs(energyShare - family.weight) < 1e-12,
      `${name}/${family.id} preserves exact represented source energy`
    );
  }
  assert.ok(
    plan.anchors.filter((anchor) => anchor.edge !== null).every((anchor) => anchor.familyId !== null),
    `${name} gives every edge anchor a source-derived family preference`
  );
}

function sampleHueFamilyShares(plan: ColorFieldPlan, resolution: number) {
  const counts = { cool: 0, warm: 0, neutral: 0, green: 0 };
  for (let row = 0; row < resolution; row += 1) {
    for (let column = 0; column < resolution; column += 1) {
      const { h, s } = rgbToHsl(hexToRgb(sampleColorField(
        plan,
        (column + 0.5) / resolution,
        (row + 0.5) / resolution
      )));
      if (s < 0.12) counts.neutral += 1;
      else if (h < 100 || h >= 300) counts.warm += 1;
      else if (h >= 150 && h < 300) counts.cool += 1;
      else counts.green += 1;
    }
  }
  const total = resolution * resolution;
  return {
    cool: counts.cool / total,
    warm: counts.warm / total,
    neutral: counts.neutral / total,
    green: counts.green / total
  };
}

function assertContinuousSampling(plan: ColorFieldPlan, name: string) {
  const columns = Math.ceil(18 * Math.max(1, plan.aspect));
  const rows = Math.ceil(18 * Math.max(1, 1 / plan.aspect));
  let largestNeighborDelta = 0;
  let isolatedLuminanceExtrema = 0;
  const luminanceGrid = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, column) =>
      relativeLuminance(sampleColorField(plan, column / columns, row / rows))
    )
  );
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const color = sampleColorField(plan, column / columns, row / rows);
      if (column < columns) {
        largestNeighborDelta = Math.max(
          largestNeighborDelta,
          colorDistanceOklab(color, sampleColorField(plan, (column + 1) / columns, row / rows))
        );
      }
      if (row < rows) {
        largestNeighborDelta = Math.max(
          largestNeighborDelta,
          colorDistanceOklab(color, sampleColorField(plan, column / columns, (row + 1) / rows))
        );
      }
      if (row > 0 && row < rows && column > 0 && column < columns) {
        const current = luminanceGrid[row][column];
        const neighbors = [
          luminanceGrid[row - 1][column],
          luminanceGrid[row + 1][column],
          luminanceGrid[row][column - 1],
          luminanceGrid[row][column + 1]
        ];
        const isPeak = neighbors.every((value) => current - value > 0.006);
        const isBasin = neighbors.every((value) => value - current > 0.006);
        if (isPeak || isBasin) isolatedLuminanceExtrema += 1;
      }
    }
  }
  assert.ok(largestNeighborDelta < 0.095, `${name} has no contour-sized jump (${largestNeighborDelta.toFixed(4)})`);
  assert.equal(isolatedLuminanceExtrema, 0, `${name} has no isolated luminance peak/basin that can close a contour`);
}

function angleDistance(first: number, second: number) {
  const difference = Math.abs(first - second) % 180;
  return Math.min(difference, 180 - difference);
}

function supportsOverlap(
  first: ColorFieldPlan["anchors"][number],
  second: ColorFieldPlan["anchors"][number],
  aspect: number,
  distance: number
) {
  const dx = (second.x - first.x) * Math.max(1, aspect);
  const dy = (second.y - first.y) * Math.max(1, 1 / aspect);
  const direction = (Math.atan2(dy, dx) * 180) / Math.PI;
  return distance <= directionalRadius(first, direction) + directionalRadius(second, direction + 180);
}

function directionalRadius(anchor: ColorFieldPlan["anchors"][number], direction: number) {
  const radians = ((direction - anchor.angle) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return 1 / Math.sqrt(
    (cosine * cosine) / (anchor.radiusMajor * anchor.radiusMajor) +
    (sine * sine) / (anchor.radiusMinor * anchor.radiusMinor)
  );
}
