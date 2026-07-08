import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
  assert.ok(example.url.trim(), `${example.id} url`);
  assert.ok(example.lyrics.trim(), `${example.id} lyrics`);
  assert.ok(allowedLanguages.has(example.originalLanguage), `${example.id} original language is supported`);
  assert.ok(example.preview, `${example.id} preview`);
  assert.match(example.preview.image, /^\/examples\/generated\/[^/]+\.(png|webp)$/, `${example.id} preview image is local`);
  assert.ok(!/^https?:\/\//i.test(example.preview.image), `${example.id} preview image is not remote`);
  assert.ok(example.preview.colors.length >= 2 && example.preview.colors.length <= 3, `${example.id} preview color count`);
  for (const color of example.preview.colors.filter((item): item is string => Boolean(item))) {
    assert.match(color, hexColorPattern, `${example.id} preview color ${color}`);
  }
  assert.equal(example.preview.generatedFrom, "album-cover-palette", `${example.id} preview source`);

  const previewPath = resolve("public", example.preview.image.replace(/^\//, ""));
  assert.ok(existsSync(previewPath), `${example.id} generated preview file exists`);
  const previewBytes = readFileSync(previewPath);
  const previewText = previewBytes.toString("latin1");
  assert.ok(!previewText.includes("music.apple.com"), `${example.id} generated preview does not embed Apple Music URL`);
  assert.ok(!previewText.includes("mzstatic.com"), `${example.id} generated preview does not embed cover CDN URL`);
  assert.ok(!previewText.includes("http://") && !previewText.includes("https://"), `${example.id} generated preview does not embed remote URL`);

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
assert.ok(!/preview:\s*{[\s\S]*?image:\s*["']https?:\/\//i.test(examplesSource), "preview.image cannot be remote");
assert.ok(!examplesFloorSource.includes("src={song.preview.image}"), "examples floor must not render preview images directly");
assert.ok(examplesFloorSource.includes("getExampleCardStyle"), "examples floor must apply palette colors to the full card");
assert.equal(
  execFileSync("git", ["ls-files", "tmp/example-covers"], { encoding: "utf8" }).trim(),
  "",
  "tmp/example-covers must not be tracked"
);

console.log(JSON.stringify({ ok: true, exampleSongTests: 19 + EXAMPLE_SONGS.length * 21 }, null, 2));
