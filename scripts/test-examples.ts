import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EXAMPLE_SONGS,
  EXAMPLE_TRANSLATION_LANGUAGES,
  resolveExampleTranslation
} from "../lib/examples";
import type { Locale } from "../lib/types";

const locales: Locale[] = ["zh", "zh-TW", "en", "fr", "ja", "es"];
const forbiddenSizeKeys = ["height", "width", "cardHeight", "canvasHeight", "autoHeight", "ratio"] as const;
const hexColorPattern = /^#[0-9A-F]{6}$/i;

// Examples carry content and palette intent only; responsive card dimensions
// must remain derived by the live layout engine.
function effectiveLineCount(value: string) {
  return value.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

assert.ok(EXAMPLE_SONGS.length > 0, "at least one example song is configured");

const ids = new Set<string>();
const allowedLanguages = new Set(EXAMPLE_TRANSLATION_LANGUAGES);

for (const example of EXAMPLE_SONGS) {
  assert.ok(!ids.has(example.id), `duplicate example id: ${example.id}`);
  ids.add(example.id);

  assert.ok(example.title.trim(), `${example.id} title`);
  assert.ok(example.artist.trim(), `${example.id} artist`);
  assert.ok(example.album.trim(), `${example.id} album`);
  assert.ok(example.url.trim(), `${example.id} url`);
  assert.ok(example.lyrics.trim(), `${example.id} lyrics`);
  assert.ok(allowedLanguages.has(example.originalLanguage), `${example.id} original language is supported`);
  assert.ok(example.palette, `${example.id} palette`);
  assert.ok(example.palette.colors.length >= 2 && example.palette.colors.length <= 6, `${example.id} palette color count`);
  for (const color of example.palette.colors) {
    assert.match(color, hexColorPattern, `${example.id} palette color ${color}`);
  }
  assert.equal(example.palette.extractedFrom, "album-cover", `${example.id} palette source`);

  const expectedTranslations = locales.filter((locale) => {
    if (locale === example.originalLanguage) {
      return false;
    }
    return !(locale === "zh" && example.originalLanguage === "zh-TW") &&
      !(locale === "zh-TW" && example.originalLanguage === "zh");
  });
  assert.equal(example.translations.length, expectedTranslations.length, `${example.id} translations length`);

  const rawExample = example as unknown as Record<string, unknown>;
  for (const key of forbiddenSizeKeys) {
    assert.ok(!(key in rawExample), `${example.id} must not include ${key}`);
  }

  const lyricLineCount = effectiveLineCount(example.lyrics);
  const translationLanguages = new Set<string>();

  for (const translation of example.translations) {
    assert.ok(allowedLanguages.has(translation.language), `${example.id} ${translation.language} is supported`);
    assert.ok(!translationLanguages.has(translation.language), `${example.id} duplicate ${translation.language}`);
    translationLanguages.add(translation.language);
    assert.notEqual(translation.language, example.originalLanguage, `${example.id} translations exclude original language`);
    assert.ok(translation.label.trim(), `${example.id} ${translation.language} label`);
    assert.ok(translation.text.trim(), `${example.id} ${translation.language} text`);
    assert.equal(
      effectiveLineCount(translation.text),
      lyricLineCount,
      `${example.id} ${translation.language} line count`
    );
  }

  for (const locale of locales) {
    const resolved = resolveExampleTranslation(example, locale);
    const isChineseCrossLocale =
      (locale === "zh" && example.originalLanguage === "zh-TW") ||
      (locale === "zh-TW" && example.originalLanguage === "zh");

    if (locale === example.originalLanguage || isChineseCrossLocale) {
      assert.equal(resolved.text, "", `${example.id} keeps ${locale} translation empty`);
      assert.equal(resolved.language, locale, `${example.id} resolves ${locale}`);
    } else {
      assert.ok(resolved.text.trim(), `${example.id} resolves ${locale}`);
      assert.ok(
        example.translations.some((translation) => translation.language === resolved.language),
        `${example.id} resolved ${locale} is configured`
      );
    }
  }
}

const examplesSource = readFileSync(resolve("lib/examples.ts"), "utf8");
const examplesFloorSource = readFileSync(resolve("components/editor/ExamplesFloor.tsx"), "utf8");
const lyricEditorSource = readFileSync(resolve("components/editor/LyricEditor.tsx"), "utf8");
const surfaceCloseButtonSource = readFileSync(resolve("components/layout/SurfaceCloseButton.tsx"), "utf8");
const exampleSongCardStart = examplesFloorSource.indexOf("function ExampleSongCard");
const exampleSongCardEnd = examplesFloorSource.indexOf("function getExampleCardStyle");
assert.ok(exampleSongCardStart >= 0 && exampleSongCardEnd > exampleSongCardStart, "example song card source bounds");
const exampleSongCardSource = examplesFloorSource.slice(exampleSongCardStart, exampleSongCardEnd);
const paletteGeneratorClientSource = readFileSync(resolve("app/example-palette-generator/ExamplePaletteGeneratorClient.tsx"), "utf8");
const paletteGeneratorScriptSource = readFileSync(resolve("scripts/generate-example-palettes.ts"), "utf8");
assert.ok(!examplesSource.includes("preview:"), "examples must not retain generated lyric-card previews");
assert.ok(!examplesFloorSource.includes("song.palette.colors.map"), "examples floor does not render palette swatches");
assert.ok(examplesFloorSource.includes("resolveReadableTextTokens(primary)"), "examples floor reuses readable text tokens");
assert.ok(examplesFloorSource.includes("{song.album}"), "examples floor displays real album metadata");
assert.equal(exampleSongCardSource.match(/<button\b/g)?.length, 1, "example song card has one interactive control");
assert.ok(!exampleSongCardSource.includes("<article"), "example song card root is not a passive article");
assert.ok(!exampleSongCardSource.includes("<ActionButton"), "example song card has no nested load button");
assert.ok(exampleSongCardSource.includes("type=\"button\""), "example song card uses a native button");
assert.ok(exampleSongCardSource.includes("data-testid={`load-example-${song.id}`}"), "example song card keeps its load test id");
assert.ok(exampleSongCardSource.includes("onClick={() => onLoad"), "the whole example card triggers loading");
assert.ok(examplesFloorSource.includes("examples-grid"), "examples floor uses the responsive gallery grid");
assert.ok(examplesFloorSource.includes("examples-toggle-track"), "examples floor uses its compact translation toggle");
assert.ok(examplesFloorSource.includes("examples-translation-switch"), "examples floor keeps the translation switch borderless");
assert.ok(examplesFloorSource.includes("settings-wing__header examples-wing__header"), "examples reuse the settings-style top header");
assert.ok(examplesFloorSource.includes('testId="examples-close-button"'), "examples expose the shared close control at the top");
assert.ok(!examplesFloorSource.includes("TitlebarGradualBlur"), "examples remove the bottom blur layer");
assert.ok(examplesFloorSource.includes("pb-6"), "examples keep only compact clear space below the final row");
assert.ok(examplesFloorSource.includes("examples-floor__content-scroll"), "example cards scroll independently below the fixed header");
assert.ok(surfaceCloseButtonSource.includes("examples-close-button__icon"), "settings and examples share one close button implementation");
assert.equal(lyricEditorSource.match(/<EditorHeader\b/g)?.length ?? 0, 0, "examples no longer render the legacy bottom app header");
assert.ok(!lyricEditorSource.includes("headerDockY"), "examples no longer measure a docked bottom header");
assert.ok(!examplesFloorSource.includes("var(--app-header-height)"), "examples no longer reserve space for the removed bottom header");
assert.ok(paletteGeneratorClientSource.includes("extractPaletteFromImage(item.coverDataUrl)"), "palette generator extracts directly from album covers");
assert.ok(paletteGeneratorClientSource.includes("palette === DEFAULT_PALETTE"), "palette generator rejects extraction fallback colors");
assert.ok(!paletteGeneratorClientSource.includes("LyricCard"), "palette generator does not render lyric cards");
assert.ok(!paletteGeneratorClientSource.includes("toPng"), "palette generator does not render preview PNG files");
assert.ok(paletteGeneratorScriptSource.includes("validatePaletteResults(results)"), "palette generator validates result ids");
assert.ok(paletteGeneratorScriptSource.includes("findExampleBlock(source, result.id)"), "palette sync is scoped to one example block");
assert.ok(paletteGeneratorScriptSource.includes("safeFetch(rawUrl"), "palette cover downloads use the redirect-safe fetch path");
assert.ok(paletteGeneratorScriptSource.includes("maxResponseBytes: imageLimit"), "palette cover downloads keep a hard body limit");
assert.ok(paletteGeneratorScriptSource.includes("allowedContentTypes: [\"image/\"]"), "palette cover downloads require image content");
assert.ok(!paletteGeneratorScriptSource.includes("validatePublicHttpUrl"), "palette cover downloads do not use validate-then-fetch");
assert.ok(!paletteGeneratorScriptSource.includes("fetch(safety.url"), "palette cover downloads do not bypass safe fetch");
assert.equal(
  execFileSync("git", ["ls-files", "tmp"], { encoding: "utf8" }).trim(),
  "",
  "temporary example-generation files must not be tracked"
);

console.log(JSON.stringify({ ok: true, exampleSongTests: 44 + EXAMPLE_SONGS.length * 18 }, null, 2));
