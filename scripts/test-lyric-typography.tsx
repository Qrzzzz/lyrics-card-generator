import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { LyricsBlock } from "../components/preview/LyricsBlock";
import { LandscapeLyricsContent } from "../components/preview/LandscapeLyricsContent";
import { LyricTextLines } from "../components/preview/LyricTextLines";
import { createLyricDocumentV2, mergeUnits, serializeLyricDocument } from "../lib/lyrics-document-v2";
import { getLyricLineSpacing, normalizeLyricLineHeight } from "../lib/lyric-typography";
import { LYRIC_SEPARATOR } from "../lib/lyric-separator";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

for (const fontSize of [34, 42, 60, 72]) {
  let previousWrapHeight = 0;
  let previousManualGap = 0;
  for (let step = 0; step <= 12; step++) {
    const lineHeight = Number((1.5 + step * 0.05).toFixed(2));
    const { wrapLineHeight, edgePadding } = getLyricLineSpacing(lineHeight, fontSize);
    assert.ok(wrapLineHeight < lineHeight, "soft wraps are closer than authored lines at every slider value");
    assert.ok(wrapLineHeight > previousWrapHeight, "wrap spacing responds to the slider");
    assert.ok(edgePadding * 2 > previousManualGap, "authored-line separation also responds to the slider");
    assert.ok(Math.abs(wrapLineHeight * fontSize + edgePadding * 2 - lineHeight * fontSize) < 0.0001,
      "single-line height preserves the selected authored line height");
    previousWrapHeight = wrapLineHeight;
    previousManualGap = edgePadding * 2;
  }
}
for (const value of [Number.NaN, Infinity, 0, 1.83, 10]) {
  assert.deepEqual(getLyricLineSpacing(value, 60), getLyricLineSpacing(normalizeLyricLineHeight(value), 60));
}

const source = `First authored line\nSecond authored line\n\nNext stanza\n${LYRIC_SEPARATOR}\nLast line`;
const translation = `第一行译文\n第二行译文\n\n下一段\n${LYRIC_SEPARATOR}\n末行`;
const document = createLyricDocumentV2(source, translation);
const firstUnits = document.blocks[0].units;
const merged = mergeUnits(document, firstUnits[0].id, firstUnits[1].id);
assert.ok(merged, "multi-line bilingual unit fixture merges successfully");
assert.deepEqual(serializeLyricDocument(merged), { source, translation }, "rendering needs no document migration");

for (const Component of [LyricsBlock, LandscapeLyricsContent]) {
  for (const lyricDocument of [document, merged]) {
    for (const translationEnabled of [false, true]) {
      for (const lineHeight of [1.5, 1.8, 2.1]) {
        const $ = load(renderToStaticMarkup(<Component lyricDocument={lyricDocument}
          translationEnabled={translationEnabled} lyricFontSize={60} translationScale={0.7}
          lineHeight={lineHeight} textColor="#ffffff" align="left" />));
        assert.deepEqual($("[data-auto-width-line=lyric]").map((_, element) => $(element).text()).get(),
          ["First authored line", "Second authored line", "Next stanza", "Last line"]);
        assert.equal($("[data-auto-width-line=translation]").length, translationEnabled ? 4 : 0);
        assert.equal($("[data-lyric-separator]").length, 1);
        const keys = $("[data-auto-width-line]").map((_, element) =>
          `${$(element).attr("data-auto-width-line")}:${$(element).attr("data-auto-width-line-index")}`).get();
        assert.equal(new Set(keys).size, keys.length, "all authored lines have unique measurement keys");
        for (const element of $("[data-auto-width-line]").toArray()) {
          assert.equal(element.children.length, 1, "measurement can read a direct text node for every line");
          assert.equal(element.children[0].type, "text");
          assert.ok($(element).attr("style")?.includes(`line-height:${getLyricLineSpacing(lineHeight, 60).wrapLineHeight}`));
        }
      }
    }
  }
  const $ = load(renderToStaticMarkup(<Component lyricDocument={createLyricDocumentV2("", "译文一\n译文二")}
    translationEnabled lyricFontSize={60} translationScale={0.7} lineHeight={1.8} textColor="#ffffff" align="center" />));
  assert.equal($("[data-auto-width-line=lyric]").length, 0, "translation-only units stay translation-only");
  assert.equal($("[data-auto-width-line=translation]").length, 2);

  const emptyLines = { ...document, blocks: [{ id: "blank-block", units: [{ id: "blank-unit", source: ["", ""], translation: ["", ""] }] }] };
  const blankMarkup = load(renderToStaticMarkup(<Component lyricDocument={emptyLines}
    translationEnabled lyricFontSize={60} translationScale={0.7} lineHeight={1.8} textColor="#ffffff" align="left" />));
  assert.equal(blankMarkup("[data-auto-width-line=lyric]").length, 2, "authored empty lines inside a unit keep their height");
  assert.equal(blankMarkup("[data-auto-width-line=translation]").length, 2);
}

const $ = load(renderToStaticMarkup(<LyricTextLines lines={["one\r\ntwo", "", "three"]}
  kind="translation" rowIndex={0} fontSize={42} lineHeight={1.8} className="font-medium" style={{ marginTop: 12 }} />));
assert.deepEqual($("p").map((_, element) => $(element).text()).get(), ["one", "two", "\u00a0", "three"]);
assert.match($("p").first().attr("style") ?? "", /margin-top:12px/);
assert.ok($("p").slice(1).toArray().every((element) => $(element).attr("style")?.includes("margin-top:0")),
  "the source/translation gap applies only once per track");

console.log("Lyric spacing slider, authored lines, bilingual units, separators and measurement nodes passed.");
