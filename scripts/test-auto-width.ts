import assert from "node:assert/strict";
import { defaultState } from "../components/editor/editor-defaults";
import {
  AUTO_WIDTH_MAX,
  AUTO_WIDTH_MIN,
  AUTO_WIDTH_STEP,
  chooseAutoWidth,
  getAutoWidthCandidates,
  selectCoreLineKeys,
  type AutoWidthCandidateMetrics,
  type AutoWidthLineKind,
  type AutoWidthLineMetrics
} from "../lib/auto-width";
import { segmentTextUnits } from "../lib/auto-width-dom";
import { normalizeCardStyle } from "../lib/card-style-normalize";
import { applyEditorStyleChange } from "../lib/editor/apply-style-change";

const widths = getAutoWidthCandidates();
assert.equal(widths[0], AUTO_WIDTH_MIN);
assert.equal(widths.at(-1), AUTO_WIDTH_MAX);
assert.ok(widths.every((width, index) => index === 0 || width - widths[index - 1] === AUTO_WIDTH_STEP));

assert.equal(segmentTextUnits("不让最后两个字落单。").length, 9, "CJK is measured by grapheme with punctuation attached");
assert.equal(segmentTextUnits("leave no short word behind").length, 5, "western text is measured by words");
assert.deepEqual(
  segmentTextUnits("今晚 stay with me").map((unit) => unit.kind),
  ["cjk", "cjk", "word", "word", "word"],
  "mixed-language text is segmented per run instead of by application locale"
);

const coreKeys = selectCoreLineKeys([
  line("lyric:0", "lyric", 2),
  line("lyric:1", "lyric", 12),
  line("lyric:2", "lyric", 13),
  line("lyric:3", "lyric", 14),
  line("lyric:4", "lyric", 36)
]);
assert.equal(coreKeys.has("lyric:0"), false, "very short ad-libs are not core width samples");
assert.equal(coreKeys.has("lyric:4"), false, "isolated long lines are not core width samples");

{
  const decision = chooseAutoWidth([
    candidate(1040, [
      line("lyric:0", "lyric", 14, { severeOrphan: true, visualLineCount: 2, lastLineUnitCount: 1, lastLineFill: 0.08 }),
      line("lyric:1", "lyric", 13),
      line("lyric:2", "lyric", 15),
      line("translation:0", "translation", 8, { severeOrphan: true, visualLineCount: 2, lastLineUnitCount: 1, lastLineFill: 0.12 }),
      line("translation:1", "translation", 7),
      line("translation:2", "translation", 8)
    ]),
    candidate(1080, standardLines()),
    candidate(1440, standardLines().map((item) => ({ ...item, maxLineFill: 0.36, averageLineFill: 0.36 })))
  ], 1040);
  assert.equal(decision.width, 1080, "a small widening resolves body and translation orphans");
}

{
  const normal = standardLines();
  const longTranslation = line("translation:9", "translation", 44, {
    visualLineCount: 4,
    lastLineUnitCount: 8,
    lastLineFill: 0.5,
    maxLineFill: 0.96,
    averageLineFill: 0.82
  });
  const decision = chooseAutoWidth([
    candidate(1040, [...normal, longTranslation]),
    candidate(1200, [...normal.map((item) => ({ ...item, maxLineFill: 0.62, averageLineFill: 0.62 })), { ...longTranslation, visualLineCount: 3 }]),
    candidate(1440, [...normal.map((item) => ({ ...item, maxLineFill: 0.44, averageLineFill: 0.44 })), { ...longTranslation, visualLineCount: 2 }])
  ], 1040);
  assert.notEqual(decision.width, 1440, "one long translation cannot stretch the whole card to its maximum");
}

{
  const decision = chooseAutoWidth([
    candidate(1040, [line("lyric:0", "lyric", 12), line("lyric:1", "lyric", 13)])
  ], 1040);
  assert.equal(decision.confidence, "low");
  assert.equal(decision.width, 1040, "too little content keeps the current width");
}

{
  const autoPortrait = {
    ...defaultState,
    style: { ...defaultState.style, autoWidth: true, width: 1080 },
    lastPortraitSize: { ...defaultState.lastPortraitSize!, autoWidth: true, width: 1080 },
    lastPortraitCustomSize: { ...defaultState.lastPortraitCustomSize!, autoWidth: true, width: 1080 }
  };
  const landscape = applyEditorStyleChange(autoPortrait, { ...autoPortrait.style, layoutMode: "landscape" });
  assert.equal(landscape.style.autoWidth, false);
  const portrait = applyEditorStyleChange(landscape, { ...landscape.style, layoutMode: "portrait" });
  assert.equal(portrait.style.autoWidth, true);
  assert.equal(portrait.style.width, 1080, "portrait history restores the calculated width");

  const fixed = applyEditorStyleChange(portrait, { ...portrait.style, ratio: "1:1", autoWidth: true });
  assert.equal(fixed.style.autoWidth, false, "fixed ratios cannot retain an active auto width");
  const custom = applyEditorStyleChange(fixed, { ...fixed.style, ratio: "custom" });
  assert.equal(custom.style.autoWidth, true, "returning to custom portrait restores auto width");
  assert.equal(custom.style.width, 1080);

  const instrumental = applyEditorStyleChange(custom, { ...custom.style, contentMode: "instrumental" });
  assert.equal(instrumental.style.autoWidth, false);
  const lyrics = applyEditorStyleChange(instrumental, { ...instrumental.style, contentMode: "lyrics" });
  assert.equal(lyrics.style.autoWidth, true, "leaving instrumental mode restores the lyric canvas");
  assert.equal(lyrics.style.ratio, "custom");
}

assert.equal(
  normalizeCardStyle({ ...defaultState.style, autoWidth: true, ratio: "1:1" }).autoWidth,
  false,
  "legacy or imported unsupported states are normalized"
);

console.log(JSON.stringify({ ok: true, candidateCount: widths.length }, null, 2));

function standardLines(): AutoWidthLineMetrics[] {
  return [
    line("lyric:0", "lyric", 14),
    line("lyric:1", "lyric", 13),
    line("lyric:2", "lyric", 15),
    line("translation:0", "translation", 8),
    line("translation:1", "translation", 7),
    line("translation:2", "translation", 8)
  ];
}

function candidate(canvasWidth: number, lines: AutoWidthLineMetrics[]): AutoWidthCandidateMetrics {
  return { canvasWidth, lines };
}

function line(
  key: string,
  kind: AutoWidthLineKind,
  logicalUnitCount: number,
  overrides: Partial<AutoWidthLineMetrics> = {}
): AutoWidthLineMetrics {
  return {
    key,
    kind,
    logicalUnitCount,
    visualLineCount: 1,
    lastLineUnitCount: logicalUnitCount,
    lastLineFill: 0.74,
    maxLineFill: 0.74,
    averageLineFill: 0.74,
    severeOrphan: false,
    horizontalOverflow: false,
    ...overrides
  };
}
