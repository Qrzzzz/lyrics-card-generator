import assert from "node:assert/strict";
import { oklabDistance, rgbToOklab } from "../lib/color/oklab";
import { analyzePalettePixels } from "../lib/palette-extraction";
import { hexToRgb, mixColors, relativeLuminance } from "../lib/palette-background";

type Rgba = [number, number, number, number];

const colorful = fixture(18, 12, (x, y) => {
  if (x < 7) return [220, 55 + y * 2, 65, 255];
  if (x < 13) return [30, 150, 105 + y * 3, 255];
  return [45, 85, 220, 255];
});
const colorfulPalette = deterministic(colorful, 18, 12);
assert.equal(colorfulPalette.kind, "colorful");
assert.ok(colorfulPalette.analysis!.regions.length >= 3);
assert.notEqual(colorfulPalette.analysis!.roles.base.regionId, colorfulPalette.analysis!.roles.subject.regionId);

const lowSaturation = fixture(14, 10, (x) => [118 + x, 120 + x, 122 + x, 255]);
const lowSaturationPalette = deterministic(lowSaturation, 14, 10);
assert.ok(["neutral", "low-variance"].includes(lowSaturationPalette.kind));
assert.ok(Math.max(...lowSaturationPalette.analysis!.regions.map((region) => region.chroma)) < 0.03);

const monochrome = fixture(15, 9, (x) => {
  if (x < 5) return [20, 55, 110, 255];
  if (x < 10) return [48, 92, 155, 255];
  return [92, 137, 198, 255];
});
const monochromePalette = deterministic(monochrome, 15, 9);
assert.equal(monochromePalette.kind, "monochrome");
assert.ok(monochromePalette.hueVariance < 0.025);

const localHighlight = fixture(20, 20, (x, y) => (
  x >= 16 && y >= 15 ? [250, 30, 35, 255] : [105, 110, 116, 255]
));
const highlightPalette = deterministic(localHighlight, 20, 20);
const highChromaRegion = [...highlightPalette.analysis!.regions].sort((a, b) => b.chroma - a.chroma)[0];
assert.ok(highChromaRegion.visibleShare < 0.12, "small vivid area remains local instead of becoming dominant area");
assert.ok(highChromaRegion.centroid.x > 0.75 && highChromaRegion.centroid.y > 0.7);
assert.ok(
  highlightPalette.analysis!.roles.highlights.some((role) => role.regionId === highChromaRegion.id),
  "local vivid content is retained as a highlight role"
);

const transparent = fixture(12, 8, (x, y) => {
  if (x < 4) return [0, 0, 0, 0];
  if (x < 8) return [40, 110, 220, 96];
  return [235, 190, 35, y < 4 ? 255 : 180];
});
const transparentPalette = deterministic(transparent, 12, 8);
assert.ok(transparentPalette.analysis!.visibleCoverage > 0.6 && transparentPalette.analysis!.visibleCoverage < 0.7);
assert.ok(transparentPalette.analysis!.meanAlpha > 0.35 && transparentPalette.analysis!.meanAlpha < 0.5);
assert.ok(transparentPalette.analysis!.regions.some((region) => region.meanAlpha < 0.5));
assert.ok(transparentPalette.analysis!.regions.every((region) => region.cells.length > 0));

const nonSquare = fixture(24, 6, (x) => x < 8 ? [230, 120, 30, 255] : [32, 72, 165, 255]);
const nonSquarePalette = deterministic(nonSquare, 24, 6, { sourceWidth: 2400, sourceHeight: 600 });
assert.deepEqual(
  [nonSquarePalette.analysis!.sourceWidth, nonSquarePalette.analysis!.sourceHeight, nonSquarePalette.analysis!.sampleWidth, nonSquarePalette.analysis!.sampleHeight],
  [2400, 600, 24, 6]
);
const horizontalAnchors = nonSquarePalette.analysis!.regions.map((region) => region.centroid.x);
assert.ok(Math.min(...horizontalAnchors) < 0.2 && Math.max(...horizontalAnchors) > 0.6);
assert.ok(nonSquarePalette.analysis!.regions.every((region) => region.bounds.height === 1));
assert.ok(nonSquarePalette.analysis!.regions.some((region) => region.bounds.x === 0));
assert.ok(nonSquarePalette.analysis!.regions.some((region) => region.bounds.x + region.bounds.width === 1));
assert.deepEqual(nonSquarePalette.colors.slice(0, 3), [nonSquarePalette.primary, nonSquarePalette.secondary, nonSquarePalette.accent]);

const changed = Uint8ClampedArray.from(nonSquare);
changed[0] += 1;
assert.notEqual(
  analyzePalettePixels(changed, 24, 6, { sourceWidth: 2400, sourceHeight: 600 }).analysis!.seed,
  nonSquarePalette.analysis!.seed,
  "one changed channel changes the content-derived seed"
);

assert.equal(relativeLuminance("#000000"), 0);
assert.equal(relativeLuminance("#FFFFFF"), 1);
assert.ok(Math.abs(relativeLuminance("#808080") - 0.21586) < 0.001, "luminance is linear-light WCAG luminance");
const perceptualMidpoint = mixColors("#000000", "#FFFFFF", 0.5);
assert.notEqual(perceptualMidpoint, "#808080", "mixing is not direct gamma-encoded sRGB interpolation");
const blackLab = rgbToOklab(hexToRgb("#000000"));
const whiteLab = rgbToOklab(hexToRgb("#FFFFFF"));
const midpointLab = rgbToOklab(hexToRgb(perceptualMidpoint));
assert.ok(
  Math.abs(oklabDistance(blackLab, midpointLab) - oklabDistance(midpointLab, whiteLab)) < 0.01,
  "the mixed color is perceptually centered in OKLab"
);

console.log("Spatial perceptual palette extraction tests passed.");

function deterministic(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: { sourceWidth?: number; sourceHeight?: number } = {}
) {
  const first = analyzePalettePixels(data, width, height, options);
  const second = analyzePalettePixels(data, width, height, options);
  assert.deepEqual(second, first, "same canonical pixels must produce exactly the same analysis");
  assert.match(first.analysis!.seed, /^[0-9A-F]{8}$/);
  assert.equal(first.analysis!.version, 1);
  return first;
}

function fixture(width: number, height: number, pixel: (x: number, y: number) => Rgba) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rgba = pixel(x, y);
      data.set(rgba, (y * width + x) * 4);
    }
  }
  return data;
}

