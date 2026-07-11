import assert from "node:assert/strict";
import { __internalLyricsViewportSession } from "../components/editor/hooks/useLyricsViewportSession";

const {
  calculateViewportMetrics,
  getParagraphLineRanges,
  getTextAnchor,
  heightForMode,
  isConnectedEditorInWorkspace,
  resolveAnchoredScrollTop,
  resolveMappedTextAnchorRatio,
  resolveModeFromHeight,
  immersiveSnapThreshold
} = __internalLyricsViewportSession;

const minimumDesktopMetrics = calculateViewportMetrics(398);
assert.deepEqual(minimumDesktopMetrics, {
  minHeight: 240,
  standardHeight: 271,
  expandedHeight: 334,
  maxHeight: 398
});
assert.ok(
  minimumDesktopMetrics.standardHeight < minimumDesktopMetrics.expandedHeight &&
    minimumDesktopMetrics.expandedHeight < minimumDesktopMetrics.maxHeight,
  "the 1000x700 content budget keeps three distinct stable viewport heights"
);
assert.equal(heightForMode("standard", minimumDesktopMetrics), 271);
assert.equal(heightForMode("expanded", minimumDesktopMetrics), 334);
assert.equal(heightForMode("immersive", minimumDesktopMetrics), 398);
assert.equal(immersiveSnapThreshold, 24);
assert.equal(
  resolveModeFromHeight(minimumDesktopMetrics.maxHeight - immersiveSnapThreshold, minimumDesktopMetrics),
  "immersive"
);
assert.equal(
  resolveModeFromHeight(minimumDesktopMetrics.maxHeight - immersiveSnapThreshold - 1, minimumDesktopMetrics),
  "expanded"
);
assert.equal(resolveModeFromHeight(271, minimumDesktopMetrics), "standard");
assert.equal(resolveModeFromHeight(334, minimumDesktopMetrics), "expanded");

const shortWindowMetrics = calculateViewportMetrics(220);
assert.deepEqual(shortWindowMetrics, {
  minHeight: 240,
  standardHeight: 240,
  expandedHeight: 240,
  maxHeight: 240
});
assert.deepEqual(calculateViewportMetrics(800), {
  minHeight: 240,
  standardHeight: 544,
  expandedHeight: 672,
  maxHeight: 800
});

const anchoredText = "verse one\nverse two\n\nchorus one\nchorus two";
const chorusSelection = anchoredText.indexOf("chorus two") + 3;
const chorusAnchor = getTextAnchor(anchoredText, chorusSelection);
assert.deepEqual(
  {
    lineIndex: chorusAnchor.lineIndex,
    lineCount: chorusAnchor.lineCount,
    paragraphIndex: chorusAnchor.paragraphIndex,
    paragraphLineOffset: chorusAnchor.paragraphLineOffset
  },
  { lineIndex: 4, lineCount: 5, paragraphIndex: 1, paragraphLineOffset: 1 },
  "selection snapshots retain logical line and paragraph coordinates"
);
assert.deepEqual(getParagraphLineRanges(anchoredText.split("\n")), [
  { startLine: 0, endLine: 1 },
  { startLine: 3, endLine: 4 }
]);
assert.equal(
  resolveMappedTextAnchorRatio(chorusAnchor, "译文一\n\n副歌一\n副歌二"),
  1,
  "a missing logical line falls back to the corresponding paragraph and line offset"
);
assert.equal(
  resolveMappedTextAnchorRatio(chorusAnchor, "only one paragraph"),
  null,
  "an unrelated document falls through to viewport-center restoration"
);

const connectedEditor = { isConnected: true } as unknown as HTMLTextAreaElement;
const disconnectedEditor = { isConnected: false } as unknown as HTMLTextAreaElement;
const workspace = {
  isConnected: true,
  contains: (node: unknown) => node === connectedEditor
} as unknown as HTMLElement;
const scrollNode = {
  isConnected: true,
  contains: (node: unknown) => node === connectedEditor
} as unknown as HTMLElement;
assert.equal(isConnectedEditorInWorkspace(connectedEditor, workspace, scrollNode), true);
assert.equal(isConnectedEditorInWorkspace(disconnectedEditor, workspace, scrollNode), false);
assert.equal(
  isConnectedEditorInWorkspace(
    connectedEditor,
    workspace,
    { ...scrollNode, contains: () => false } as unknown as HTMLElement
  ),
  false,
  "an editor outside the shared scroll workspace is never used for geometry"
);
assert.equal(
  resolveAnchoredScrollTop({
    anchorPosition: 300,
    viewportOffset: 500,
    viewportCenterOffset: 100,
    maxScroll: 380,
    scrollRatio: 0.5,
    allowCenterFallback: true
  }),
  200,
  "cross-column reflow centers the mapped logical line instead of clamping to the top"
);
assert.equal(
  resolveAnchoredScrollTop({
    anchorPosition: 50,
    viewportOffset: 500,
    viewportCenterOffset: 100,
    maxScroll: 380,
    scrollRatio: 0.5,
    allowCenterFallback: true
  }),
  190,
  "scroll ratio is the final fallback when mapped line and center targets are both unavailable"
);

console.log(JSON.stringify({ ok: true, lyricsViewportTests: 22 }, null, 2));
