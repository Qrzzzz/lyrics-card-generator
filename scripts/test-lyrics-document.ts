import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defaultState } from "../components/editor/editor-defaults";
import { measureAutoCanvasHeight } from "../components/editor/hooks/useMeasuredAutoCanvasHeight";
import {
  detectExportCardOverflow,
  EXPORT_CARD_OVERFLOW_TOLERANCE
} from "../components/editor/hooks/useExportCardReadiness";
import {
  AUTO_HEIGHT_MAX,
  AUTO_HEIGHT_MIN,
  getCardSize
} from "../lib/card-size";
import {
  countNonEmptyLogicalLines,
  getExportLyricLineStatus,
  MAX_EXPORT_LYRIC_LINES,
  MAX_LANDSCAPE_LYRIC_LINES
} from "../lib/lyrics-document";

// The logical-line policy is independent from visual wrapping; actual DOM
// overflow is validated separately with the export-card fixture below.
assert.equal(MAX_EXPORT_LYRIC_LINES, 36);
assert.equal(MAX_LANDSCAPE_LYRIC_LINES, 12);
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
    querySelector: (selector: string) => {
      if (selector === "[data-card-lyrics]") return lyrics;
      if (selector === "[data-card-lyrics-viewport]") return viewport;
      return null;
    }
  } as unknown as HTMLElement;
}

function mockContractOverflow(selectorWithOverflow: string, overflowPixels: number) {
  const element = {
    clientHeight: 100,
    clientWidth: 100,
    scrollHeight: 100,
    scrollWidth: 100 + overflowPixels
  } as HTMLElement;
  return {
    querySelector: (selector: string) => selector === selectorWithOverflow ? element : null
  } as unknown as HTMLElement;
}

assert.equal(
  detectExportCardOverflow(mockExportCard(EXPORT_CARD_OVERFLOW_TOLERANCE)),
  false,
  "font rounding at the shared settle tolerance remains exportable"
);
assert.equal(
  detectExportCardOverflow(mockExportCard(EXPORT_CARD_OVERFLOW_TOLERANCE + 1)),
  true,
  "overflow beyond the shared settle tolerance remains blocking"
);
assert.equal(
  detectExportCardOverflow(mockContractOverflow("[data-card-footer]", EXPORT_CARD_OVERFLOW_TOLERANCE)),
  false,
  "footer font rounding at the shared tolerance remains exportable"
);
assert.equal(
  detectExportCardOverflow(mockContractOverflow("[data-card-footer]", EXPORT_CARD_OVERFLOW_TOLERANCE + 1)),
  true,
  "footer overflow beyond the tolerance blocks portrait export"
);
assert.equal(
  detectExportCardOverflow(mockContractOverflow("[data-card-accessories]", EXPORT_CARD_OVERFLOW_TOLERANCE + 1)),
  true,
  "landscape accessory overflow participates in the shared export contract"
);
assert.equal(
  detectExportCardOverflow(mockContractOverflow("[data-card-content]", EXPORT_CARD_OVERFLOW_TOLERANCE + 1)),
  false,
  "the portrait aggregate content contract leaves intentional inline geometry to its descendants"
);
const verticallyOverflowingContent = {
  clientHeight: 100,
  clientWidth: 100,
  scrollHeight: 100 + EXPORT_CARD_OVERFLOW_TOLERANCE + 1,
  scrollWidth: 100
} as HTMLElement;
assert.equal(
  detectExportCardOverflow({
    querySelector: (selector: string) => selector === "[data-card-content]" ? verticallyOverflowingContent : null
  } as unknown as HTMLElement),
  true,
  "the aggregate content contract still blocks vertical clipping"
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

const landscapeBoundary = getExportLyricLineStatus({
  lyrics: Array.from({ length: 6 }, (_, index) => `original ${index + 1}`).join("\n"),
  translationText: Array.from({ length: 6 }, (_, index) => `translation ${index + 1}`).join("\n"),
  translationEnabled: true,
  layoutMode: "landscape"
});
assert.equal(landscapeBoundary.totalLineCount, 12);
assert.equal(landscapeBoundary.canExport, true);
const landscapeExceeded = getExportLyricLineStatus({
  lyrics: `${landscapeBoundary.originalLineCount ? Array.from({ length: 7 }, (_, index) => `original ${index + 1}`).join("\n") : ""}`,
  translationText: Array.from({ length: 6 }, (_, index) => `translation ${index + 1}`).join("\n"),
  translationEnabled: true,
  layoutMode: "landscape"
});
assert.equal(landscapeExceeded.totalLineCount, 13);
assert.equal(landscapeExceeded.exceededLineCount, 1);
assert.equal(landscapeExceeded.canExport, false);

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
  1080,
  "landscape waits on its derived plan instead of treating legacy height as a crop boundary"
);

// Exercise the geometry used by export readiness, including wrapped lyrics and titles.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { getComputedStyle: () => ({ paddingTop: "0px", paddingBottom: "0px" }) }
});
try {
  const autoHeightState = {
    ...defaultState,
    style: { ...portraitAutoStyle, width: 720, height: 1480 }
  };
  const measuredLyrics = { scrollHeight: 3600 };
  const measuredHeader = { scrollHeight: 100 };
  const measuredCard = {
    matches: (selector: string) => selector === "[data-export-card]",
    querySelector: (selector: string) => {
      if (selector === "[data-card-content]") return {};
      if (selector === "[data-card-lyrics]") return measuredLyrics;
      if (selector === "[data-card-header]") return measuredHeader;
      return null;
    }
  } as unknown as HTMLElement;
  const longAutoHeight = measureAutoCanvasHeight(autoHeightState, measuredCard);
  assert.ok(longAutoHeight !== null && longAutoHeight > 3200 && longAutoHeight <= AUTO_HEIGHT_MAX);

  measuredHeader.scrollHeight += 180;
  assert.equal(
    measureAutoCanvasHeight(autoHeightState, measuredCard),
    longAutoHeight + 180,
    "wrapped song titles contribute their measured height to the automatic canvas"
  );
  measuredLyrics.scrollHeight = AUTO_HEIGHT_MAX + 1;
  assert.equal(measureAutoCanvasHeight(autoHeightState, measuredCard), AUTO_HEIGHT_MAX);
} finally {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
}

const exportHostSource = readFileSync(resolve("components/editor/ExportCardHost.tsx"), "utf8");
assert.ok(exportHostSource.includes('aria-hidden="true"'));
assert.ok(exportHostSource.includes("inert"));
assert.ok(exportHostSource.includes('left: "-100000px"'));
assert.ok(exportHostSource.indexOf("data-export-card-host") < exportHostSource.indexOf("data-export-card-host-content"));
assert.doesNotMatch(exportHostSource, /\b(?:display|visibility|opacity)\s*:/);

const portraitLyricsSource = readFileSync(resolve("components/preview/LyricsBlock.tsx"), "utf8");
const landscapeLyricsSource = readFileSync(resolve("components/preview/LandscapeLyricsContent.tsx"), "utf8");
assert.ok(
  portraitLyricsSource.includes("getLyricDocumentRows(lyricDocument)") &&
    portraitLyricsSource.includes("documentRows.map"),
  "portrait export renders every structured unit, including translation-only tail units"
);
assert.ok(
  landscapeLyricsSource.includes("getLyricDocumentRows(lyricDocument)") &&
    landscapeLyricsSource.includes("rows.map"),
  "landscape export renders every structured unit, including translation-only tail units"
);

const readinessSource = readFileSync(resolve("components/editor/hooks/export-card-dom-coordinator.ts"), "utf8");
assert.ok(
  readinessSource.includes("attributes: true") && readinessSource.includes('attributeFilter: ["class", "style"]'),
  "readiness rechecks overflow after measured geometry changes inline styles"
);
const editorActionsSource = readFileSync(resolve("components/editor/hooks/useEditorActions.ts"), "utf8");
assert.ok(
  editorActionsSource.includes("getExportBlockMessage?.(mountedSnapshot)") &&
    editorActionsSource.includes("runExportTransaction"),
  "the export action performs a fresh validation against the mounted immutable snapshot"
);

console.log(JSON.stringify({ ok: true, lyricsDocumentTests: 33 }, null, 2));
