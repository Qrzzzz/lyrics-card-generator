import assert from "node:assert/strict";
import {
  EXAMPLE_SONGS,
  EXAMPLE_TRANSLATION_LANGUAGES,
  resolveExampleTranslation
} from "../lib/examples";
import type { Locale } from "../lib/types";

const locales: Locale[] = ["zh", "zh-TW", "en", "fr", "ja", "es"];
const forbiddenSizeKeys = ["height", "width", "cardHeight", "canvasHeight", "autoHeight", "ratio"] as const;

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

console.log(JSON.stringify({ ok: true, exampleSongTests: 11 + EXAMPLE_SONGS.length * 12 }, null, 2));
