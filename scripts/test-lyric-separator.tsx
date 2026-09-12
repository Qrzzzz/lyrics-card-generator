import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createRequire } from "node:module";
import {
  LYRIC_SEPARATOR as token, adjacentSeparator, expandSeparatorSelection,
  insertSeparator, protectSeparatorEdit, separatorRanges
} from "../lib/lyric-separator";
import {
  applyUnitTranslations, cloneLyricDocument, countLyricDocumentLines, createLyricDocumentV2,
  getLyricDocumentRows, hasAuthoredLyrics, reconcileLyricDocumentV2, serializeLyricDocument,
  swapLyricDocumentColumns
} from "../lib/lyrics-document-v2";
import { parseStructuredTranslation } from "../lib/ai/structured-translation";
import { LyricsBlock } from "../components/preview/LyricsBlock";
import { LandscapeLyricsContent } from "../components/preview/LandscapeLyricsContent";
import { defaultState } from "../components/editor/editor-defaults";
import { normalizeCardStyle } from "../lib/card-style-normalize";
import { analyzeLyricsDocument, mergeSelectedLyricsLines } from "../lib/lyrics-workbench";
import { splitAlternatingLyrics } from "../lib/lyric-format";
import { separatorCopy } from "../lib/lyric-separator-copy";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const text = `First\n${token}\nLast`;
const range = { start: 6, end: 6 + token.length };
assert.deepEqual(separatorRanges(text), [range]);
assert.deepEqual(separatorRanges(`literal ${token} text`), []);
assert.deepEqual(expandSeparatorSelection(text, { start: 9, end: 9 }), range);
assert.deepEqual(expandSeparatorSelection(text, { start: 2, end: 10 }), { start: 2, end: range.end });
assert.deepEqual(adjacentSeparator(text, range.end + 1, true), range);
assert.deepEqual(adjacentSeparator(text, range.start - 1, false), range);
assert.equal(adjacentSeparator(text, text.length, true), undefined);
assert.equal(insertSeparator("First\nLast", 2).text, text);
assert.equal(insertSeparator("First\n\nLast", 6).text, `First\n${token}\n\nLast`);
assert.equal(insertSeparator("", 0).text, `${token}\n`);
assert.equal(insertSeparator("\nLast", 0).text, `${token}\nLast`);
assert.equal(insertSeparator(text, 9).text, text);
assert.equal(protectSeparatorEdit(text, text.slice(0, 10) + text.slice(11), 10).text, "First\nLast");
assert.equal(protectSeparatorEdit(text, text.slice(0, 9) + "替换" + text.slice(10), 11).text, "First\n替换\nLast");
assert.equal(protectSeparatorEdit(text, text.replace(`\n${token}`, token), 5).text, text);
assert.equal(protectSeparatorEdit(text, text.replace(`${token}\n`, token), range.end).text, text);
assert.equal(protectSeparatorEdit(text, text.replace(token, `before${token}`), 12).text, `First\nbefore\n${token}\nLast`);
assert.equal(protectSeparatorEdit(text, text.replace(token, `${token}after`), range.end + 5).text, `First\n${token}\nafter\nLast`);
assert.equal(protectSeparatorEdit(text, "", 0).text, "");
assert.equal(protectSeparatorEdit(text, text.replace(token, "<replacement />"), 20, range).text, "First\n<replacement />\nLast");
const stanzas = createLyricDocumentV2(insertSeparator("First\n\nLast", 6).text, "一\n\n二");
assert.deepEqual(getLyricDocumentRows(stanzas).filter((row) => !row.isSeparator).map((row) => row.translation), [["一"], ["二"]]);

const document = createLyricDocumentV2(text, "一\n二");
const rows = getLyricDocumentRows(document);
assert.equal(rows.length, 3);
assert.deepEqual(rows.map((row) => [row.source, row.translation]), [[["First"], ["一"]], [[], []], [["Last"], ["二"]]]);
assert.equal(rows[1].isSeparator, true);
assert.deepEqual(countLyricDocumentLines(document), { source: 2, translation: 2, total: 4 });
assert.equal(hasAuthoredLyrics(createLyricDocumentV2(token)), false);
assert.deepEqual(serializeLyricDocument(cloneLyricDocument(document)), { source: text, translation: "一\n二" });
const dual = createLyricDocumentV2(text, `一\n${token}\n二`);
assert.equal(getLyricDocumentRows(dual).filter((row) => row.isSeparator).length, 1);
assert.equal(getLyricDocumentRows(swapLyricDocumentColumns(document))[1].isSeparator, true);
const edited = reconcileLyricDocumentV2(document, text.replace("Last", "Later"), "一\n二");
assert.equal(getLyricDocumentRows(edited)[1].unitId, rows[1].unitId);
assert.equal(applyUnitTranslations(document, [{ id: rows[1].unitId, translation: ["bad"] }]), null);
const translated = parseStructuredTranslation(JSON.stringify([
  { id: rows[0].unitId, translation: ["壹"] }, { id: rows[2].unitId, translation: ["贰"] }
]), document);
assert.equal(translated.text, "壹\n贰");
assert.equal(getLyricDocumentRows(translated.document)[1].isSeparator, true);
assert.equal(analyzeLyricsDocument({ lyrics: text, translationText: "一\n二", translationEnabled: true }).lineDifference, 0);
assert.equal(mergeSelectedLyricsLines(`One\nTwo\n${token}\nThree\nFour`, { start: 0, end: 100 }).text, `One Two\n${token}\nThree Four`);
assert.deepEqual(splitAlternatingLyrics(`First\n一\n${token}\nLast\n二`, "zh"), { lyrics: text, translationText: `一\n${token}\n二` });

for (const separatorStyle of ["dot", "line"] as const) {
  for (const Component of [LyricsBlock, LandscapeLyricsContent]) {
    const $ = load(renderToStaticMarkup(<Component lyricDocument={document} translationEnabled
      lyricFontSize={60} translationScale={0.7} lineHeight={1.6} textColor="#fff" align="left" separatorStyle={separatorStyle} />));
    assert.equal($(`[data-lyric-separator="${separatorStyle}"]`).length, 1);
    assert.equal($("[data-auto-width-line]").length, 4);
    assert.ok(!$.text().includes(token));
    assert.equal($("[data-lyric-separator]").prev().text(), "First一");
    assert.equal($("[data-lyric-separator]").next().text(), "Last二");
  }
}
assert.equal(normalizeCardStyle({ ...defaultState.style, separatorStyle: undefined }).separatorStyle, "dot");
assert.equal(normalizeCardStyle({ ...defaultState.style, separatorStyle: "line" }).separatorStyle, "line");
const require = createRequire(import.meta.url);
const { normalizeEditorDraft } = require("../electron/editor-draft.js");
const draft = normalizeEditorDraft({ version: 1, content: { lyricDocument: document },
  style: { ...defaultState.style, separatorStyle: "line" }, view: { step: 4, exportFormat: "png", exportQuality: "high" }
}, (content: unknown) => content);
assert.equal(draft.style.separatorStyle, "line");
assert.deepEqual(Object.keys(separatorCopy).sort(), ["en", "es", "fr", "ja", "zh", "zh-TW"].sort());
for (const copy of Object.values(separatorCopy)) {
  assert.ok(Object.values(copy).every((value) => value.trim().length > 0));
}
console.log("Separator editing, bilingual alignment, translation, persistence and both card layouts passed.");
