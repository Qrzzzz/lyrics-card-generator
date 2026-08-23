import assert from "node:assert/strict";
import { splitUsefulLines } from "../components/preview/LandscapeLyricsContent";
import {
  createLandscapeLayoutPlan,
  DEFAULT_LANDSCAPE_LAYOUT_SETTINGS,
  getLandscapeLyricsWidthCandidates,
  migrateLegacyLandscapeSize,
  normalizeLandscapeLayoutSettings
} from "../lib/landscape-plan";

const left = {
  coverWidth: 480,
  coverHeight: 320,
  metadataWidth: 480,
  metadataHeight: 230,
  accessoriesWidth: 480,
  accessoriesHeight: 72
};

function measured(lyricsWidth: number, naturalHeight: number, visualLineCount = 1) {
  return {
    lyricsWidth,
    naturalHeight,
    lines: [{
      key: `lyric:${lyricsWidth}`,
      kind: "lyric" as const,
      visualLineCount,
      lastLineFill: visualLineCount > 1 ? 0.62 : 0.72,
      averageLineFill: 0.72,
      severeOrphan: false,
      horizontalOverflow: false
    }]
  };
}

const automatic = createLandscapeLayoutPlan({
  measurementKey: "automatic",
  settings: DEFAULT_LANDSCAPE_LAYOUT_SETTINGS,
  left,
  lyricsCandidates: [measured(520, 1700, 3), measured(800, 980, 1), measured(1120, 820, 1)]
});
assert(automatic);
assert.equal(automatic.lyricsRect.width, 800, "near-scoring candidates prefer a compact safe width");
assert.equal(automatic.lyricsRect.height, 980, "right column uses its DOM-measured natural height");
assert.equal(automatic.canvas.height >= automatic.lyricsRect.height + 168, true, "canvas contains measured lyrics plus margins");

const manual = createLandscapeLayoutPlan({
  measurementKey: "manual",
  settings: {
    autoLyricsWidth: false,
    lyricsWidth: 710,
    autoHeight: false,
    requestedHeight: 900
  },
  left,
  lyricsCandidates: [measured(710, 1450, 2)]
});
assert(manual);
assert.equal(manual.lyricsRect.width, 710);
assert.equal(manual.canvas.height >= 1450 + 168, true, "manual height is a floor, never a crop cap");

const shortLyrics = createLandscapeLayoutPlan({
  measurementKey: "short",
  settings: DEFAULT_LANDSCAPE_LAYOUT_SETTINGS,
  left,
  lyricsCandidates: [measured(880, 180)]
});
assert(shortLyrics);
assert.equal(shortLyrics.lyricsRect.y > shortLyrics.safeRect.y, true, "short lyrics center within left-column height");
assert.equal(shortLyrics.leftScale >= 0.78 && shortLyrics.leftScale <= 1.28, true);

const tallCover = createLandscapeLayoutPlan({
  measurementKey: "tall-cover",
  settings: DEFAULT_LANDSCAPE_LAYOUT_SETTINGS,
  left: { ...left, coverWidth: 120, coverHeight: 640 },
  lyricsCandidates: [measured(880, 600)]
});
assert(tallCover);
assert.equal(
  Math.abs(tallCover.coverRect.width / tallCover.coverRect.height - 120 / 640) < 0.002,
  true,
  "artwork ratio stays exact within final integer-pixel rounding"
);

const extraHeight = createLandscapeLayoutPlan({
  measurementKey: "extra-height",
  settings: { ...DEFAULT_LANDSCAPE_LAYOUT_SETTINGS, autoHeight: false, requestedHeight: 2200 },
  left,
  lyricsCandidates: [measured(880, 420)]
});
assert(extraHeight);
assert.equal(extraHeight.leftScale, 1.28, "left design unit stops growing at its maximum scale");
assert.equal(extraHeight.flexibleGap > 500, true, "excess height is absorbed by the flexible middle gap");

assert.deepEqual(
  normalizeLandscapeLayoutSettings({ autoLyricsWidth: false, lyricsWidth: 1, autoHeight: false, requestedHeight: 99 }),
  { autoLyricsWidth: false, lyricsWidth: 520, autoHeight: false, requestedHeight: 720 }
);
assert.equal(getLandscapeLyricsWidthCandidates(DEFAULT_LANDSCAPE_LAYOUT_SETTINGS).at(0), 520);
assert.equal(getLandscapeLyricsWidthCandidates(DEFAULT_LANDSCAPE_LAYOUT_SETTINGS).at(-1), 1280);
assert.deepEqual(
  migrateLegacyLandscapeSize({ ratio: "16:9", width: 1920, height: 1080, autoWidth: false, autoHeight: false }),
  { ...DEFAULT_LANDSCAPE_LAYOUT_SETTINGS, requestedHeight: 1080 },
  "legacy presets migrate to new free-layout defaults"
);
assert.deepEqual(
  splitUsefulLines("\nOriginal one\n\nOriginal three\n"),
  ["Original one", "", "Original three"],
  "internal blank rows remain available for bilingual alignment"
);

console.log("Landscape plan tests passed.");
