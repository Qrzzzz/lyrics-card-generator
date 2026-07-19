import assert from "node:assert/strict";
import {
  analyzeLyricsDocument,
  cleanPastedLyrics,
  cleanSynchronizedBlankRows,
  collapseConsecutiveBlankLines,
  createLyricsOperationHistory,
  getLyricsLineSelection,
  mergeSelectedLyricsLines,
  previewParagraphTags,
  recordLyricsOperation,
  redoLyricsOperation,
  removeAllBlankLines,
  removeParagraphTags,
  resolveLyricsTextScope,
  snapshotsEqual,
  stripLrcTimeline,
  swapLyricsColumns,
  trimBoundaryBlankLines,
  undoLyricsOperation,
  type LyricsHistoryEntry
} from "../lib/lyrics-workbench";

const selectedMiddle = resolveLyricsTextScope(
  "first\nsecond\nthird\nfourth",
  { start: 8, end: 14 }
);
assert.deepEqual(
  selectedMiddle,
  {
    start: 6,
    end: 18,
    startLine: 2,
    endLine: 3,
    hasSelection: true,
    text: "second\nthird"
  },
  "a partial selection expands to complete intersecting lines"
);
assert.deepEqual(
  resolveLyricsTextScope("one\ntwo\nthree", { start: 4, end: 4 }),
  {
    start: 0,
    end: 13,
    startLine: 1,
    endLine: 3,
    hasSelection: false,
    text: "one\ntwo\nthree"
  },
  "a caret-only scope targets the whole active column"
);
assert.deepEqual(
  resolveLyricsTextScope("one\ntwo\nthree", { start: 0, end: 4 }),
  {
    start: 0,
    end: 3,
    startLine: 1,
    endLine: 1,
    hasSelection: true,
    text: "one"
  },
  "a selection ending at the next line start does not include that line"
);
assert.deepEqual(
  resolveLyricsTextScope("one\r\ntwo", { start: 0, end: 3 }),
  {
    start: 0,
    end: 3,
    startLine: 1,
    endLine: 1,
    hasSelection: true,
    text: "one"
  },
  "a selected CRLF line excludes the complete line terminator"
);
assert.equal(
  cleanPastedLyrics("one\r\ntwo", { start: 0, end: 3 }).text,
  "one\r\ntwo",
  "selected cleanup does not duplicate the LF half of a CRLF terminator"
);

const trimmed = trimBoundaryBlankLines(
  "\n \nalpha\n\nbeta\n\t\n",
  { start: 0, end: 0 }
);
assert.equal(trimmed.text, "alpha\n\nbeta");
assert.equal(trimmed.stats.removedLines, 4);
assert.equal(trimmed.changed, true);

const collapsed = collapseConsecutiveBlankLines(
  "alpha\n \n\t\nbeta\n\n\ncharlie",
  { start: 0, end: 0 }
);
assert.equal(collapsed.text, "alpha\n\nbeta\n\ncharlie");
assert.equal(collapsed.stats.removedLines, 2);

const blankSelectionSource = "keep\n\n\nselected\n\n\nend";
const blankSelection = collapseConsecutiveBlankLines(
  blankSelectionSource,
  { start: blankSelectionSource.indexOf("\n\n") + 1, end: blankSelectionSource.lastIndexOf("\n\n") + 1 }
);
assert.equal(blankSelection.text, "keep\n\nselected\n\n\nend");
assert.equal(blankSelection.scope.hasSelection, true);
assert.equal(blankSelection.selection.start, 5);
assert.equal(blankSelection.selection.end, 15);

const withoutBlanks = removeAllBlankLines(
  "alpha\n \nbeta\n\t\ncharlie",
  { start: 0, end: 0 }
);
assert.equal(withoutBlanks.text, "alpha\nbeta\ncharlie");
assert.equal(withoutBlanks.stats.removedLines, 2);

const pasted = cleanPastedLyrics(
  "\uFEFFAlpha  \r\n\u200BBeta\t\r \rGamma！ \t",
  { start: 0, end: 0 }
);
assert.equal(pasted.text, "Alpha\nBeta\n\nGamma！");
assert.equal(pasted.stats.newlineChanges, 3);
assert.equal(pasted.stats.invisibleCharacters, 2);
assert.equal(pasted.stats.trailingWhitespaceLines, 3);
assert.equal(pasted.stats.whitespaceOnlyLines, 1);
assert.match(pasted.text, /Gamma！$/u, "paste cleanup preserves authored punctuation");

const lrc = stripLrcTimeline(
  "[ar:Artist]\n[ti:Song]\n[00:01.20] First line\n[00:03.50][00:04.00]Second line\n[00:06.00]",
  { start: 0, end: 0 }
);
assert.equal(lrc.text, "\n\nFirst line\nSecond line\n");
assert.equal(lrc.stats.metadata, 2);
assert.equal(lrc.stats.timestamps, 4);

const mergeSource = "before\nfirst selected\n second selected \nthird selected\nafter";
const merged = mergeSelectedLyricsLines(
  mergeSource,
  {
    start: mergeSource.indexOf("first selected") + 3,
    end: mergeSource.indexOf("third selected") + 5
  }
);
assert.equal(merged.text, "before\nfirst selected second selected third selected\nafter");
assert.equal(merged.stats.mergedLines, 2);
assert.equal(
  mergeSelectedLyricsLines(mergeSource, { start: 2, end: 2 }).changed,
  false,
  "merging requires an explicit multi-line selection"
);

const tagged = "[Verse 1]\nHello\n【副歌】\nWorld\n[00:10.00]\n[Not a known label]";
assert.deepEqual(
  previewParagraphTags(tagged, { start: 0, end: 0 }),
  [
    { line: 1, text: "[Verse 1]" },
    { line: 3, text: "【副歌】" }
  ],
  "tag preview only recognizes a conservative structural-label allowlist"
);
const tagsRemoved = removeParagraphTags(tagged, { start: 0, end: 0 });
assert.equal(tagsRemoved.text, "Hello\nWorld\n[00:10.00]\n[Not a known label]");
assert.equal(tagsRemoved.stats.removedLines, 2);

const alignedOriginal = "\noriginal 1\n\n\noriginal 2\n\noriginal tail";
const alignedTranslation = "\ntranslation 1\n\n\ntranslation 2\ntranslation tail\n";
const synchronizedTrim = cleanSynchronizedBlankRows({
  lyrics: alignedOriginal,
  translationText: alignedTranslation,
  mode: "trim"
});
assert.equal(synchronizedTrim.removedRows, 1);
assert.equal(synchronizedTrim.lyrics, "original 1\n\n\noriginal 2\n\noriginal tail");
assert.equal(synchronizedTrim.translationText, "translation 1\n\n\ntranslation 2\ntranslation tail\n");

const synchronizedCollapse = cleanSynchronizedBlankRows({
  lyrics: alignedOriginal,
  translationText: alignedTranslation,
  mode: "collapse"
});
assert.equal(synchronizedCollapse.removedRows, 1);
assert.equal(synchronizedCollapse.lyrics, "\noriginal 1\n\noriginal 2\n\noriginal tail");
assert.equal(synchronizedCollapse.translationText, "\ntranslation 1\n\ntranslation 2\ntranslation tail\n");

const synchronizedAll = cleanSynchronizedBlankRows({
  lyrics: alignedOriginal,
  translationText: alignedTranslation,
  mode: "all",
  lineRange: { startLine: 3, endLine: 4 }
});
assert.equal(synchronizedAll.removedRows, 2);
assert.equal(synchronizedAll.lyrics, "\noriginal 1\noriginal 2\n\noriginal tail");
assert.equal(synchronizedAll.translationText, "\ntranslation 1\ntranslation 2\ntranslation tail\n");

const unsafeSingleBlank = cleanSynchronizedBlankRows({
  lyrics: "one\n\ntwo",
  translationText: "uno\ntranslated content\ndos",
  mode: "all"
});
assert.equal(unsafeSingleBlank.changed, false);
assert.equal(unsafeSingleBlank.lyrics, "one\n\ntwo");
assert.equal(
  unsafeSingleBlank.translationText,
  "uno\ntranslated content\ndos",
  "synchronized cleanup never deletes a row that is non-empty in either column"
);

const swapped = swapLyricsColumns({
  lyrics: "original",
  translationText: "translation",
  translationEnabled: false
});
assert.deepEqual(swapped, {
  lyrics: "translation",
  translationText: "original",
  translationEnabled: true
});

const analysis = analyzeLyricsDocument({
  lyrics: `short\n${"long ".repeat(20).trim()}\nrepeat\nrepeat\nzero\u200Bwidth`,
  translationText: "court\nlongue",
  translationEnabled: true,
  longLineThreshold: 40
});
assert.equal(analysis.originalLineCount, 5);
assert.equal(analysis.translationLineCount, 2);
assert.equal(analysis.lineDifference, 3);
assert.equal(analysis.firstUnpairedLine, 3);
assert.deepEqual(
  analysis.issues.map((issue) => [issue.kind, issue.editor, issue.line]),
  [
    ["long-line", "lyrics", 2],
    ["duplicate-line", "lyrics", 4],
    ["invisible-character", "lyrics", 5]
  ],
  "review reports long, duplicate, and invisible-character issues without mutating text"
);
assert.equal(
  analyzeLyricsDocument({
    lyrics: "chorus\nchorus",
    translationText: "",
    translationEnabled: false
  }).issues[0]?.kind,
  "duplicate-line",
  "repeated chorus is diagnostic only"
);
assert.deepEqual(getLyricsLineSelection("one\ntwo\nthree", 2), { start: 4, end: 7 });
assert.deepEqual(getLyricsLineSelection("one\ntwo\nthree", 8), { start: 13, end: 13 });

const before = { lyrics: "before", translationText: "avant", translationEnabled: true };
const after = { lyrics: "after", translationText: "après", translationEnabled: true };
const historyEntry: LyricsHistoryEntry = {
  label: "cleanup",
  before,
  after,
  beforeSelection: { editor: "lyrics", start: 1, end: 3 },
  afterSelection: { editor: "lyrics", start: 0, end: 5 }
};
let history = recordLyricsOperation(createLyricsOperationHistory(), historyEntry);
assert.equal(history.past.length, 1);
assert.equal(history.future.length, 0);
const undo = undoLyricsOperation(history);
assert.deepEqual(undo.snapshot, before);
assert.deepEqual(undo.selection, historyEntry.beforeSelection);
assert.equal(undo.history.past.length, 0);
assert.equal(undo.history.future.length, 1);
const redo = redoLyricsOperation(undo.history);
assert.deepEqual(redo.snapshot, after);
assert.deepEqual(redo.selection, historyEntry.afterSelection);
assert.equal(redo.history.past.length, 1);
assert.equal(redo.history.future.length, 0);
history = recordLyricsOperation(undo.history, {
  ...historyEntry,
  label: "new cleanup",
  after: { ...after, lyrics: "new branch" }
});
assert.equal(history.future.length, 0, "a new operation clears redo history");
assert.equal(snapshotsEqual(before, { ...before }), true);
assert.equal(snapshotsEqual(before, after), false);

console.log(JSON.stringify({ ok: true, lyricsWorkbenchTests: 63 }, null, 2));
