import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defaultState } from "../components/editor/editor-defaults";
import {
  getArtworkAspectRatio,
  isArtworkAnalysisSettled,
  resolveAdaptiveArtworkSize
} from "../lib/artwork-geometry";
import { getLandscapeLayout, getPortraitLayout } from "../lib/card-layout-engine";
import { COVER_IMAGE_ANALYSIS_TIMEOUT_MS } from "../lib/palette-extraction";
import type { CoverArtworkAnalysis } from "../lib/types";

const sourceUrl = "https://example.test/artwork.png";
const square = artwork(1200, 1200);
const horizontal = artwork(1200, 802);
const vertical = artwork(879, 1200);

assert.deepEqual(resolveAdaptiveArtworkSize({ baseSize: 196, aspectRatio: 1 }), {
  width: 196,
  height: 196,
  aspectRatio: 1,
  constrained: false
});
assert.deepEqual(resolveAdaptiveArtworkSize({ baseSize: 196, aspectRatio: 1200 / 802 }), {
  width: 293,
  height: 196,
  aspectRatio: 1200 / 802,
  constrained: false
});
assert.deepEqual(resolveAdaptiveArtworkSize({ baseSize: 196, aspectRatio: 879 / 1200 }), {
  width: 196,
  height: 268,
  aspectRatio: 879 / 1200,
  constrained: false
});

const extremeHorizontal = resolveAdaptiveArtworkSize({
  baseSize: 196,
  aspectRatio: 10,
  maxWidth: 500,
  maxHeight: 400
});
assert.deepEqual(extremeHorizontal, {
  width: 500,
  height: 50,
  aspectRatio: 10,
  constrained: true
});
const extremeVertical = resolveAdaptiveArtworkSize({
  baseSize: 196,
  aspectRatio: 0.1,
  maxWidth: 500,
  maxHeight: 400
});
assert.deepEqual(extremeVertical, {
  width: 40,
  height: 400,
  aspectRatio: 0.1,
  constrained: true
});

assert.equal(getArtworkAspectRatio(sourceUrl, horizontal), 1200 / 802);
assert.equal(getArtworkAspectRatio("https://example.test/replacement.png", horizontal), 1);
assert.equal(isArtworkAnalysisSettled(sourceUrl, undefined), false);
assert.equal(isArtworkAnalysisSettled(sourceUrl, horizontal), true);
assert.equal(isArtworkAnalysisSettled("", undefined), true);
assert.ok(
  COVER_IMAGE_ANALYSIS_TIMEOUT_MS > 0 && COVER_IMAGE_ANALYSIS_TIMEOUT_MS < 10000,
  "cover analysis must settle before the default export transaction timeout"
);

const portraitStyle = {
  ...defaultState.style,
  layoutMode: "portrait" as const,
  contentMode: "lyrics" as const,
  showCover: true,
  showSongInfo: true
};
const portraitSize = { width: 1040, height: 1080 };
const portraitSquare = getPortraitLayout(portraitSize, portraitStyle, defaultState.song, {
  sourceUrl,
  analysis: square
});
const portraitHorizontal = getPortraitLayout(portraitSize, portraitStyle, defaultState.song, {
  sourceUrl,
  analysis: horizontal
});
const portraitVertical = getPortraitLayout(portraitSize, portraitStyle, defaultState.song, {
  sourceUrl,
  analysis: vertical
});
assert.deepEqual(dimensions(portraitSquare.coverRect), { width: 196, height: 196 });
assert.deepEqual(dimensions(portraitHorizontal.coverRect), { width: 293, height: 196 });
assert.deepEqual(dimensions(portraitVertical.coverRect), { width: 196, height: 268 });
assert.ok(portraitVertical.headerRect!.height >= portraitVertical.coverRect!.height);
assert.ok(portraitVertical.lyricsRect.y > portraitVertical.coverRect!.y + portraitVertical.coverRect!.height);

const landscapeStyle = {
  ...portraitStyle,
  layoutMode: "landscape" as const,
  ratio: "16:9" as const,
  autoWidth: false,
  autoHeight: false
};
const landscapeSize = { width: 1920, height: 1080 };
const landscapeSquare = getLandscapeLayout(landscapeSize, landscapeStyle, defaultState.song, {
  sourceUrl,
  analysis: square
});
const landscapeHorizontal = getLandscapeLayout(landscapeSize, landscapeStyle, defaultState.song, {
  sourceUrl,
  analysis: horizontal
});
const landscapeVertical = getLandscapeLayout(landscapeSize, landscapeStyle, defaultState.song, {
  sourceUrl,
  analysis: vertical
});
assert.equal(landscapeSquare.coverRect!.width, landscapeSquare.coverRect!.height);
assert.equal(landscapeHorizontal.coverRect!.height, landscapeSquare.coverRect!.height);
assert.ok(landscapeHorizontal.coverRect!.width > landscapeSquare.coverRect!.width);
assert.ok(landscapeVertical.coverRect!.height > landscapeSquare.coverRect!.height);
assert.equal(landscapeVertical.coverRect!.width, landscapeSquare.coverRect!.width);
assert.ok(landscapeHorizontal.contentRect.x > landscapeHorizontal.coverRect!.x + landscapeHorizontal.coverRect!.width);
assert.ok(landscapeVertical.coverRect!.height <= landscapeSize.height - 96);

const landscapeVerticalWithFooter = getLandscapeLayout(
  landscapeSize,
  { ...landscapeStyle, showPlatformBadge: true },
  { ...defaultState.song, source: "apple" },
  { sourceUrl, analysis: vertical }
);
assert.equal(landscapeVerticalWithFooter.coverRect!.width, landscapeSquare.coverRect!.width);
assert.ok(landscapeVerticalWithFooter.footerRect!.x >= landscapeVerticalWithFooter.contentRect.x);
assert.ok(
  landscapeVerticalWithFooter.footerRect!.x >=
    landscapeVerticalWithFooter.coverRect!.x + landscapeVerticalWithFooter.coverRect!.width,
  "a tall cover may use the footer band only when the footer moves into the text column"
);

const adaptiveArtworkSource = readFileSync(resolve("components/preview/AdaptiveAlbumArtwork.tsx"), "utf8");
const paletteSource = readFileSync(resolve("lib/palette-extraction.ts"), "utf8");
const exportSnapshotSource = readFileSync(resolve("lib/export-snapshot.ts"), "utf8");
assert.match(adaptiveArtworkSource, /object-contain/);
assert.doesNotMatch(adaptiveArtworkSource, /object-cover/);
assert.match(paletteSource, /containsTransparency/);
assert.match(paletteSource, /Cover image analysis timed out\./);
assert.match(exportSnapshotSource, /coverArtwork/);

console.log("Adaptive artwork geometry tests passed.");

function artwork(naturalWidth: number, naturalHeight: number): CoverArtworkAnalysis {
  return {
    sourceUrl,
    naturalWidth,
    naturalHeight,
    aspectRatio: naturalWidth / naturalHeight,
    hasTransparency: false,
    status: "ready"
  };
}

function dimensions(rect: { width: number; height: number } | undefined) {
  assert.ok(rect);
  return { width: rect.width, height: rect.height };
}
