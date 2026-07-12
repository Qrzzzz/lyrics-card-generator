import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defaultState } from "../components/editor/editor-defaults";
import { detectExportCardOverflow } from "../components/editor/hooks/useExportCardReadiness";
import { AUTO_HEIGHT_SETTLE_TOLERANCE } from "../components/editor/hooks/useMeasuredAutoCanvasHeight";
import {
  AUTO_HEIGHT_MAX,
  AUTO_HEIGHT_MIN,
  estimateCardHeight,
  getCardSize
} from "../lib/card-size";
import {
  countNonEmptyLogicalLines,
  getExportLyricLineStatus,
  MAX_EXPORT_LYRIC_LINES
} from "../lib/lyrics-document";

assert.equal(MAX_EXPORT_LYRIC_LINES, 36);
assert.equal(countNonEmptyLogicalLines(""), 0);
assert.equal(countNonEmptyLogicalLines("one\n\n two \n\t\nthree"), 3);
assert.equal(countNonEmptyLogicalLines("one\r\ntwo\rthree"), 3);
assert.equal(countNonEmptyLogicalLines("a single visually wrapping line ".repeat(20)), 1);

function mockExportCard(overflowPixels: number) {
  const lyrics = {
    clientHeight: 100,
    clientWidth: 100,
    scrollHeight: 100 + overflowPixels,
    scrollWidth: 100
  } as HTMLElement;
  const viewport = {
    clientHeight: 100,
    clientWidth: 100,
    scrollHeight: 100,
    scrollWidth: 100
  } as HTMLElement;
  return {
    querySelector: (selector: string) => selector === "[data-card-lyrics]" ? lyrics : viewport
  } as unknown as HTMLElement;
}

assert.equal(
  detectExportCardOverflow(mockExportCard(AUTO_HEIGHT_SETTLE_TOLERANCE)),
  false,
  "font rounding at the shared settle tolerance remains exportable"
);
assert.equal(
  detectExportCardOverflow(mockExportCard(AUTO_HEIGHT_SETTLE_TOLERANCE + 1)),
  true,
  "overflow beyond the shared settle tolerance remains blocking"
);

const translationDisabled = getExportLyricLineStatus({
  lyrics: "one\ntwo",
  translationText: "uno\ndos\ntres",
  translationEnabled: false
});
assert.deepEqual(
  {
    original: translationDisabled.originalLineCount,
    translation: translationDisabled.translationLineCount,
    total: translationDisabled.totalLineCount,
    remaining: translationDisabled.remainingLineCount,
    canExport: translationDisabled.canExport
  },
  { original: 2, translation: 0, total: 2, remaining: 34, canExport: true }
);

const exactlyAtLimit = getExportLyricLineStatus({
  lyrics: Array.from({ length: 18 }, (_, index) => `original ${index + 1}`).join("\n"),
  translationText: Array.from({ length: 18 }, (_, index) => `translation ${index + 1}`).join("\n"),
  translationEnabled: true
});
assert.equal(exactlyAtLimit.totalLineCount, 36);
assert.equal(exactlyAtLimit.remainingLineCount, 0);
assert.equal(exactlyAtLimit.isOverLimit, false);
assert.equal(exactlyAtLimit.canExport, true);

const overLimit = getExportLyricLineStatus({
  lyrics: Array.from({ length: 37 }, (_, index) => `line ${index + 1}`).join("\r\n"),
  translationEnabled: false
});
assert.equal(overLimit.totalLineCount, 37);
assert.equal(overLimit.exceededLineCount, 1);
assert.equal(overLimit.isOverLimit, true);
assert.equal(overLimit.canExport, false);

const instrumental = getExportLyricLineStatus({
  lyrics: Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join("\n"),
  translationText: Array.from({ length: 60 }, (_, index) => `translation ${index + 1}`).join("\n"),
  translationEnabled: true,
  contentMode: "instrumental"
});
assert.equal(instrumental.totalLineCount, 120);
assert.equal(instrumental.isExempt, true);
assert.equal(instrumental.isOverLimit, false);
assert.equal(instrumental.canExport, true);

const portraitAutoStyle = {
  ...defaultState.style,
  layoutMode: "portrait" as const,
  ratio: "custom" as const,
  autoHeight: true,
  height: AUTO_HEIGHT_MAX + 1000
};
assert.equal(getCardSize(portraitAutoStyle).height, AUTO_HEIGHT_MAX);
assert.equal(
  getCardSize({ ...portraitAutoStyle, height: AUTO_HEIGHT_MIN - 100 }).height,
  AUTO_HEIGHT_MIN
);
assert.equal(
  getCardSize({ ...portraitAutoStyle, autoHeight: false }).height,
  3200,
  "manual portrait height keeps the existing maximum"
);
assert.equal(
  getCardSize({
    ...portraitAutoStyle,
    layoutMode: "landscape",
    autoHeight: true
  }).height,
  1600,
  "landscape keeps its existing maximum even if legacy state says auto height"
);

const longAutoHeightEstimate = estimateCardHeight({
  width: 720,
  lyrics: Array.from({ length: 36 }, () => "a deliberately long authored lyric line for wrapping").join("\n"),
  translationEnabled: false,
  translationScale: 0.75,
  lyricFontSize: 72,
  lineHeight: 1.8,
  contentMode: "lyrics",
  showCover: true,
  showSongInfo: true,
  hasAlbumName: true,
  allowTwoLineTitle: true,
  showGeneratedWatermark: true,
  showPlatformBadge: true,
  showSharedBy: true
});
assert.ok(longAutoHeightEstimate > 3200);
assert.ok(longAutoHeightEstimate <= AUTO_HEIGHT_MAX);

const exportHostSource = readFileSync(resolve("components/editor/ExportCardHost.tsx"), "utf8");
assert.ok(exportHostSource.includes('aria-hidden="true"'));
assert.ok(exportHostSource.includes("inert"));
assert.ok(exportHostSource.includes('left: "-100000px"'));
assert.ok(exportHostSource.indexOf("data-export-card-host") < exportHostSource.indexOf("data-export-card-host-content"));
assert.doesNotMatch(exportHostSource, /\b(?:display|visibility|opacity)\s*:/);

const portraitLyricsSource = readFileSync(resolve("components/preview/LyricsBlock.tsx"), "utf8");
const landscapeLyricsSource = readFileSync(resolve("components/preview/LandscapeLyricsBlock.tsx"), "utf8");
assert.ok(
  portraitLyricsSource.includes("Math.max(lines.length, translationEnabled ? translationLines.length : 0)"),
  "portrait export renders translation-only tail rows instead of dropping them"
);
assert.ok(
  landscapeLyricsSource.includes("Math.max(lines.length, translationEnabled ? translationLines.length : 0)"),
  "landscape export renders translation-only tail rows instead of dropping them"
);

const readinessSource = readFileSync(resolve("components/editor/hooks/useExportCardReadiness.ts"), "utf8");
assert.ok(
  readinessSource.includes("attributes: true") && readinessSource.includes('attributeFilter: ["class", "style"]'),
  "readiness rechecks overflow after landscape font fitting changes inline styles"
);
const editorActionsSource = readFileSync(resolve("components/editor/hooks/useEditorActions.ts"), "utf8");
assert.ok(
  editorActionsSource.includes("getExportBlockMessage?.()"),
  "the export action performs a fresh defensive validation"
);

console.log(JSON.stringify({ ok: true, lyricsDocumentTests: 33 }, null, 2));
