import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { LyricCard } from "../components/preview/LyricCard";
import { getCardSize } from "../lib/card-size";
import { createLandscapeLayoutPlan } from "../lib/landscape-plan";
import { normalizeCardStyle } from "../lib/card-style-normalize";
import { defaultState } from "../components/editor/editor-defaults";
import { DEFAULT_PALETTE } from "../lib/palette-background";
import { createColorFieldPlan } from "../lib/spatial-color-field";
import type { CardRatio, CardStyle, CoverArtworkAnalysis, ExtractedPalette } from "../lib/types";

// Keep the palette/ratio/content/grid fixture matrix on the production renderer.
// The retired readability simulator cannot stand in for actual card output.
(globalThis as typeof globalThis & { React: typeof React }).React = React;
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
  title: "Card Layout Fixture",
  artist: "Palette Matrix",
  album: "Renderer Fixture",
  explicit: false,
  originalCoverUrl: "fixture://cover",
  coverUrl: "fixture://cover",
  proxiedCoverUrl: "fixture://cover",
  originalUrl: "fixture://song"
};

let matrixCases = 0;
for (const paletteFixture of paletteFixtures) {
  for (const ratioFixture of ratioFixtures) {
    for (const contentMode of ["lyrics", "instrumental"] as const) {
      for (const showFineGrid of [false, true]) {
        let style = createStyle(ratioFixture, paletteFixture.palette, contentMode, showFineGrid);
        if (style.layoutMode === "landscape") {
          const landscapePlan = createLandscapeLayoutPlan({
            measurementKey: ratioFixture.id + "-" + contentMode + "-" + showFineGrid,
            settings: { autoLyricsWidth: false, lyricsWidth: ratioFixture.width > 2000 ? 1200 : 880,
              autoHeight: false, requestedHeight: ratioFixture.height },
            left: { coverWidth: 480, coverHeight: 480, metadataWidth: 480, metadataHeight: 250,
              accessoriesWidth: 480, accessoriesHeight: 72 },
            lyricsCandidates: [{ lyricsWidth: ratioFixture.width > 2000 ? 1200 : 880, naturalHeight: 680,
              lines: [{ key: "lyric:0", kind: "lyric", visualLineCount: 1, lastLineFill: 0.7,
                averageLineFill: 0.7, severeOrphan: false, horizontalOverflow: false }] }]
          });
          assert.ok(landscapePlan, ratioFixture.id + " produces a measured landscape plan");
          style = { ...style, ratio: "custom", landscapePlan };
        }
        const label = paletteFixture.id + "/" + ratioFixture.id + "/" + contentMode + "/grid-" + showFineGrid;
        const size = getCardSize(style);
        const $ = load(renderToStaticMarkup(createElement(LyricCard, {
          song, lyricDocument: defaultState.lyricDocument, style, coverArtwork: paletteFixture.artwork
        })));
        const card = $('[data-export-card="true"]');
        assert.equal(card.length, 1, label + " renders one export card");
        assert.equal(cssNumber(card.attr("style"), "width"), size.width, label + " preserves canvas width");
        assert.equal(cssNumber(card.attr("style"), "height"), size.height, label + " preserves canvas height");
        assert.equal($('[data-card-fine-grid="true"]').length, Number(showFineGrid), label + " obeys the grid toggle");
        assert.equal($('[data-local-readability-layer="true"]').length, 0, label + " uses the current per-glyph depth");
        const safe = $('[data-card-safe]').attr("style");
        const left = cssNumber(safe, "left"), top = cssNumber(safe, "top");
        const width = cssNumber(safe, "width"), height = cssNumber(safe, "height");
        assert.ok(left >= 0 && top >= 0 && width > 0 && height > 0, label + " has a nonempty safe region");
        assert.ok(left + width <= size.width && top + height <= size.height, label + " keeps safe bounds in the canvas");
        const field = createColorFieldPlan({ width: size.width, height: size.height, palette: paletteFixture.palette });
        assert.equal($('[data-palette-field]').attr("data-palette-field"), field.topology, label + " uses the production palette topology");
        assert.equal($('[data-palette-field]').attr("data-palette-field-seed"), String(field.seed), label + " keeps deterministic palette output");
        matrixCases++;
      }
    }
  }
}
console.log(JSON.stringify({ ok: true, matrixCases, palettes: paletteFixtures.length, ratios: ratioFixtures.length,
  contentModes: 2, fineGridStates: 2, renderer: "LyricCard" }, null, 2));

function cssNumber(style: string | undefined, property: string) {
  const value = style?.split(";").find((declaration) => declaration.startsWith(property + ":"))?.split(":")[1];
  const number = Number.parseFloat(value ?? "");
  assert.ok(Number.isFinite(number), property + " must be a finite rendered dimension");
  return number;
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
  });
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
