import assert from "node:assert/strict";
import {
  applyReadabilityPlanToGrid,
  createCardReadabilityPlan,
  evaluateBackgroundComposition,
  type CompositionSampleGrid,
  type RgbSample
} from "../lib/background-composition-constraints";
import { getPortraitLayout } from "../lib/card-layout-engine";
import { getCardSize } from "../lib/card-size";
import { createLandscapeLayoutPlan } from "../lib/landscape-plan";
import { resolveAdaptiveArtworkSize } from "../lib/artwork-geometry";
import { normalizeCardStyle } from "../lib/card-style-normalize";
import { defaultState } from "../components/editor/editor-defaults";
import { DEFAULT_PALETTE } from "../lib/palette-background";
import { createColorFieldPlan, sampleColorField } from "../lib/spatial-color-field";
import type { CardRatio, CardStyle, CoverArtworkAnalysis, ExtractedPalette } from "../lib/types";

type RatioFixture = {
  id: string;
  layoutMode: "portrait" | "landscape";
  ratio: CardRatio;
  width: number;
  height: number;
};

const ratioFixtures: RatioFixture[] = [
  { id: "1:1", layoutMode: "portrait", ratio: "1:1", width: 1080, height: 1080 },
  { id: "4:5", layoutMode: "portrait", ratio: "4:5", width: 1080, height: 1350 },
  { id: "9:16", layoutMode: "portrait", ratio: "9:16", width: 1080, height: 1920 },
  { id: "16:9", layoutMode: "landscape", ratio: "16:9", width: 1920, height: 1080 },
  { id: "21:9", layoutMode: "landscape", ratio: "21:9", width: 2520, height: 1080 },
  { id: "super-long", layoutMode: "portrait", ratio: "custom", width: 1080, height: 4200 }
];

const paletteFixtures: Array<{
  id: string;
  palette: ExtractedPalette;
  artwork: CoverArtworkAnalysis;
}> = [
  {
    id: "colorful",
    palette: DEFAULT_PALETTE,
    artwork: artwork(false)
  },
  {
    id: "low-saturation",
    palette: palette({
      colors: ["#667085", "#7B8493", "#9AA0A8", "#242A32", "#E5E7EB", "#6B7280"],
      primary: "#667085",
      secondary: "#7B8493",
      accent: "#9AA0A8",
      dark: "#242A32",
      light: "#E5E7EB",
      muted: "#6B7280",
      averageLuminance: 0.31,
      averageSaturation: 0.09,
      hueVariance: 0.05,
      kind: "low-variance"
    }),
    artwork: artwork(false)
  },
  {
    id: "monochrome",
    palette: palette({
      colors: ["#575757", "#777777", "#A0A0A0", "#171717", "#EEEEEE", "#686868"],
      primary: "#575757",
      secondary: "#777777",
      accent: "#A0A0A0",
      dark: "#171717",
      light: "#EEEEEE",
      muted: "#686868",
      averageLuminance: 0.27,
      averageSaturation: 0,
      hueVariance: 0,
      kind: "monochrome"
    }),
    artwork: artwork(false)
  },
  {
    id: "local-high-saturation",
    palette: palette({
      colors: ["#FF2D95", "#17406D", "#23D5AB", "#11162A", "#F7F7F0", "#525B72"],
      primary: "#FF2D95",
      secondary: "#17406D",
      accent: "#23D5AB",
      dark: "#11162A",
      light: "#F7F7F0",
      muted: "#525B72",
      averageLuminance: 0.29,
      averageSaturation: 0.64,
      hueVariance: 0.48,
      kind: "colorful"
    }),
    artwork: artwork(false)
  },
  {
    id: "transparent-cover",
    palette: palette({
      colors: ["#4F46E5", "#0EA5E9", "#F59E0B", "#111827", "#F8FAFC", "#64748B"],
      primary: "#4F46E5",
      secondary: "#0EA5E9",
      accent: "#F59E0B",
      dark: "#111827",
      light: "#F8FAFC",
      muted: "#64748B",
      averageLuminance: 0.34,
      averageSaturation: 0.55,
      hueVariance: 0.37,
      kind: "colorful"
    }),
    artwork: artwork(true)
  }
];

const song = {
  source: "apple" as const,
  title: "Readability Fixture",
  artist: "Constraint Matrix",
  album: "v5.10.1",
  explicit: false,
  originalCoverUrl: "fixture://cover",
  coverUrl: "fixture://cover",
  proxiedCoverUrl: "fixture://cover",
  originalUrl: "fixture://song"
};

let matrixCases = 0;
let maximumZoneCoverage = 0;
let minimumAdjustedContrast = Number.POSITIVE_INFINITY;

for (const paletteFixture of paletteFixtures) {
  for (const ratioFixture of ratioFixtures) {
    for (const contentMode of ["lyrics", "instrumental"] as const) {
      for (const showFineGrid of [false, true]) {
        let style = createStyle(ratioFixture, paletteFixture.palette, contentMode, showFineGrid);
        const landscapePlan = style.layoutMode === "landscape"
          ? createLandscapeLayoutPlan({
              measurementKey: `${ratioFixture.id}-${contentMode}-${showFineGrid}`,
              settings: { autoLyricsWidth: false, lyricsWidth: ratioFixture.width > 2000 ? 1200 : 880, autoHeight: false, requestedHeight: ratioFixture.height },
              left: {
                ...resolveAdaptiveArtworkSize({ baseSize: 480, aspectRatio: paletteFixture.artwork.aspectRatio, maxWidth: 480, maxHeight: 480 }),
                coverWidth: 480,
                coverHeight: 480,
                metadataWidth: 480,
                metadataHeight: 250,
                accessoriesWidth: 480,
                accessoriesHeight: 72
              },
              lyricsCandidates: [{ lyricsWidth: ratioFixture.width > 2000 ? 1200 : 880, naturalHeight: 680, lines: [{ key: "lyric:0", kind: "lyric", visualLineCount: 1, lastLineFill: 0.7, averageLineFill: 0.7, severeOrphan: false, horizontalOverflow: false }] }]
            })
          : null;
        if (landscapePlan) style = { ...style, ratio: "custom", landscapePlan };
        const size = getCardSize(style);
        const layout = landscapePlan ?? getPortraitLayout(size, style, song, { sourceUrl: song.coverUrl, analysis: paletteFixture.artwork });
        const plan = createCardReadabilityPlan({ canvas: size, style, palette: paletteFixture.palette, layout });
        const repeated = createCardReadabilityPlan({ canvas: size, style, palette: paletteFixture.palette, layout });

        assert.deepEqual(plan, repeated, `${caseId()} is deterministic`);
        assert.ok(plan.zones.length >= 1 && plan.zones.length <= 3, `${caseId()} has bounded local zones`);
        assert.ok(plan.overlayOpacity >= 0.18 && plan.overlayOpacity <= 0.52, `${caseId()} has bounded tone adjustment`);
        for (const zone of plan.zones) {
          assert.ok(zone.rect.x >= 0 && zone.rect.y >= 0, `${caseId()} starts inside the canvas`);
          assert.ok(zone.rect.x + zone.rect.width <= size.width + 0.001, `${caseId()} fits horizontally`);
          assert.ok(zone.rect.y + zone.rect.height <= size.height + 0.001, `${caseId()} fits vertically`);
        }

        const coverage = unionCoverage(plan.zones.map((zone) => zone.rect), size, 72, 72);
        maximumZoneCoverage = Math.max(maximumZoneCoverage, coverage);
        assert.ok(coverage < 0.82, `${caseId()} must not become a whole-card overlay (${coverage.toFixed(3)})`);

        const field = createProductionColorFieldGrid(paletteFixture.palette, size, 72, 72);
        const adjusted = applyReadabilityPlanToGrid(field, plan);
        const evaluation = evaluateBackgroundComposition(adjusted, plan);
        minimumAdjustedContrast = Math.min(minimumAdjustedContrast, evaluation.metrics.minimumTextContrast);
        assert.ok(
          evaluation.metrics.minimumTextContrast >= 4.5,
          `${caseId()} protects local text contrast (${evaluation.metrics.minimumTextContrast.toFixed(3)})`
        );
        assert.ok(
          evaluation.metrics.adjacentColorDeltaP95 <= 0.085,
          `${caseId()} limits p95 adjacent OKLab delta (${evaluation.metrics.adjacentColorDeltaP95.toFixed(3)})`
        );
        assert.ok(
          evaluation.metrics.luminanceStepP95 <= 0.075,
          `${caseId()} keeps local transitions smooth (${evaluation.metrics.luminanceStepP95.toFixed(3)})`
        );
        matrixCases += 1;

        function caseId() {
          return `${paletteFixture.id}/${ratioFixture.id}/${contentMode}/grid-${showFineGrid ? "on" : "off"}`;
        }
      }
    }
  }
}

baselineContrastFailureIsExplained();
metricDetectorsRejectKnownArtifacts();
invalidGridIsRejected();

console.log(JSON.stringify({
  ok: true,
  matrixCases,
  palettes: paletteFixtures.length,
  ratios: ratioFixtures.length,
  contentModes: 2,
  fineGridStates: 2,
  maximumZoneCoverage: round(maximumZoneCoverage),
  minimumAdjustedContrast: round(minimumAdjustedContrast),
  metrics: [
    "local contrast",
    "adjacent OKLab delta",
    "bright-spot area",
    "dark floor",
    "luminance transition",
    "closed contour",
    "parallel band"
  ]
}, null, 2));

function baselineContrastFailureIsExplained() {
  const ratio = ratioFixtures[1];
  const style = createStyle(ratio, DEFAULT_PALETTE, "lyrics", false);
  const size = getCardSize(style);
  const layout = getPortraitLayout(size, style, song, { sourceUrl: song.coverUrl, analysis: artwork(false) });
  const plan = createCardReadabilityPlan({ canvas: size, style, palette: DEFAULT_PALETTE, layout });
  const unprotected = solidGrid(64, 64, { r: 125, g: 125, b: 125 });
  const baseline = evaluateBackgroundComposition(unprotected, plan);
  const adjusted = evaluateBackgroundComposition(applyReadabilityPlanToGrid(unprotected, plan), plan);
  assert.ok(baseline.failures.includes("minimumTextContrast"), "the v5.9.7-style unprotected field explains its contrast failure");
  assert.ok(adjusted.metrics.minimumTextContrast >= 4.5, "local tone control repairs the same field");
}

function metricDetectorsRejectKnownArtifacts() {
  const style = createStyle(ratioFixtures[0], DEFAULT_PALETTE, "lyrics", false);
  const size = getCardSize(style);
  const layout = getPortraitLayout(size, style, song, { sourceUrl: song.coverUrl, analysis: artwork(false) });
  const plan = createCardReadabilityPlan({ canvas: size, style, palette: DEFAULT_PALETTE, layout });
  const bands = patternedGrid(64, 64, (x, y) => y % 4 < 2 ? { r: 245, g: 245, b: 245 } : { r: 35, g: 35, b: 35 });
  const abrupt = patternedGrid(64, 64, (x) => x < 32 ? { r: 255, g: 20, b: 120 } : { r: 5, g: 28, b: 80 });
  const contour = patternedGrid(64, 64, (x, y) => x >= 20 && x < 44 && y >= 20 && y < 44
    ? { r: 252, g: 252, b: 252 }
    : { r: 28, g: 30, b: 36 });

  assert.ok(evaluateBackgroundComposition(bands, plan).failures.includes("maximumParallelBandScore"), "parallel bands are detected");
  assert.ok(evaluateBackgroundComposition(abrupt, plan).failures.includes("maximumAdjacentColorDelta"), "abrupt color splits are detected");
  const contourEvaluation = evaluateBackgroundComposition(contour, plan);
  assert.ok(
    contourEvaluation.metrics.closedContourCount > 0 && contourEvaluation.metrics.largestClosedContourFraction > 0,
    "closed bright contours are measured"
  );
}

function invalidGridIsRejected() {
  assert.throws(
    () => evaluateBackgroundComposition({ width: 2, height: 2, samples: [{ r: 0, g: 0, b: 0 }] }, {
      canvas: { width: 2, height: 2 },
      textColor: "#FFFFFF",
      overlayColor: "#000000",
      overlayOpacity: 0.5,
      assumedBackgroundLuminance: 0.5,
      alignment: "left",
      zones: []
    }),
    /sample count/
  );
}

function createStyle(
  fixture: RatioFixture,
  extractedPalette: ExtractedPalette,
  contentMode: "lyrics" | "instrumental",
  showFineGrid: boolean
): CardStyle {
  return normalizeCardStyle({
    ...defaultState.style,
    layoutMode: fixture.layoutMode,
    ratio: fixture.ratio,
    width: fixture.width,
    height: fixture.height,
    autoWidth: false,
    autoHeight: false,
    contentMode,
    extractedPalette,
    showFineGrid,
    showCover: true,
    showSongInfo: true,
    showAlbumName: true,
    showGeneratedWatermark: true,
    showSharedBy: true,
    sharedByText: "Fixture",
    showPlatformBadge: true
  });
}

function createProductionColorFieldGrid(
  extractedPalette: ExtractedPalette,
  canvas: { width: number; height: number },
  width: number,
  height: number
): CompositionSampleGrid {
  const fieldPlan = createColorFieldPlan({ width: canvas.width, height: canvas.height, palette: extractedPalette });
  return patternedGrid(width, height, (x, y) =>
    hex(sampleColorField(
      fieldPlan,
      (x + 0.5) / width,
      (y + 0.5) / height
    ))
  );
}

function patternedGrid(
  width: number,
  height: number,
  sample: (x: number, y: number) => RgbSample
): CompositionSampleGrid {
  const samples: RgbSample[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) samples.push(sample(x, y));
  }
  return { width, height, samples };
}

function solidGrid(width: number, height: number, sample: RgbSample) {
  return patternedGrid(width, height, () => sample);
}

function unionCoverage(
  rects: Array<{ x: number; y: number; width: number; height: number }>,
  canvas: { width: number; height: number },
  width: number,
  height: number
) {
  let covered = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = (x + 0.5) / width * canvas.width;
      const py = (y + 0.5) / height * canvas.height;
      if (rects.some((rect) => px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height)) {
        covered += 1;
      }
    }
  }
  return covered / (width * height);
}

function artwork(hasTransparency: boolean): CoverArtworkAnalysis {
  return {
    sourceUrl: "fixture://cover",
    naturalWidth: 1200,
    naturalHeight: 802,
    aspectRatio: 1200 / 802,
    hasTransparency,
    status: "ready"
  };
}

function palette(input: Omit<ExtractedPalette, "isLightCover">): ExtractedPalette {
  return { ...input, isLightCover: input.averageLuminance > 0.5 };
}

function hex(value: string) {
  const normalized = value.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
