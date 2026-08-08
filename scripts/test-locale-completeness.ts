import assert from "node:assert/strict";
import { AI_ERROR_CODES, getAIErrorMessage } from "../lib/ai/error-copy";
import { getAIPromptUiCopy } from "../lib/ai/prompt-ui-copy";
import { getAIUiCopy } from "../lib/ai/ui-copy";
import { messages } from "../lib/i18n";
import { importHistoryCopy } from "../lib/import-history-copy";
import { LOCALE_BCP47 } from "../lib/locale-language";
import { settingsCopy } from "../lib/settings/copy";
import type { Locale } from "../lib/types";
import { detectWebLiteLocale, webLiteCopy } from "../web-lite/copy";

const locales: Locale[] = ["zh", "zh-TW", "en", "fr", "ja", "es"];
const translatedLocales: Locale[] = ["fr", "ja", "es"];

// Catalog checks enforce key and placeholder parity while allowing a small set
// of protocol labels and product terms to remain intentionally shared.
assertCatalog("main", messages, new Set([
  "chinese", "english", "songSearchSourceNetease", "album", "auto", "gridDense",
  "lyricsSource", "qualityLow"
]));
assertCatalog("settings", settingsCopy, new Set([
  "ai", "general", "export", "image", "source", "low", "accentOrange", "accentCustomPlaceholder", "version"
]));
assertCatalog("import history", importHistoryCopy, new Set(["filterLabel"]));
assertCatalog("AI UI", fromGetter((locale) => getAIUiCopy(locale) as unknown as Record<string, string>), new Set([
  "temperature"
]));
assertCatalog("AI prompt UI", fromGetter((locale) => getAIPromptUiCopy(locale) as unknown as Record<string, string>), new Set());
assertCatalog("AI errors", Object.fromEntries(locales.map((locale) => [
  locale,
  Object.fromEntries(AI_ERROR_CODES.map((code) => [code, getAIErrorMessage(locale, code)]))
])) as Record<Locale, Record<string, string>>, new Set());
assertCatalog("Web Lite", webLiteCopy, new Set([
  "badge", "remoteCoverPlaceholder", "sourceHanSans", "sourceHanSerif", "exportStandard"
]));

assert.equal(settingsCopy.en.close, "Close");
assert.equal(settingsCopy["zh-TW"].close, "關閉");
assert.notEqual(settingsCopy.en.close, settingsCopy.en.cancel, "instant-save settings distinguish close from cancel");
assert.equal(getAIUiCopy("ja").live, "リアルタイム");
assert.notEqual(getAIUiCopy("fr").close, getAIUiCopy("fr").cancel, "AI panel distinguishes close from cancel");

assert.equal(messages.zh.songSearchImportedNoLyrics, "已导入歌曲信息，但没有找到歌词；歌词区已清空。");
assert.equal(messages["zh-TW"].songSearchImportedNoLyrics, "已匯入歌曲資訊，但沒有找到歌詞；歌詞欄位已清空。");
assert.equal(messages.en.songSearchImportedNoLyrics, "Song details imported, but no lyrics were found. The lyrics field was cleared.");

assert.equal(messages["zh-TW"].appSubtitle, "製作 Apple Music 風格的歌詞分享圖片");
assert.equal(messages["zh-TW"].songSearchDescription, "輸入歌名、演出者或專輯，選取結果後匯入歌曲資訊與歌詞。");
assert.equal(messages["zh-TW"].localAudioTitle, "上傳本機音訊檔");
assert.equal(messages["zh-TW"].madeWith, "由 Lyric Card Generator 產生");

const traditionalCatalog = Object.values(messages["zh-TW"]).join("\n");
for (const simplifiedPhrase of ["设置", "关闭", "选择", "语言", "歌词", "图片", "网络", "错误", "保存", "加载", "导出", "简体", "音乐"]) {
  assert.equal(traditionalCatalog.includes(simplifiedPhrase), false, `zh-TW contains ${simplifiedPhrase}`);
}

assert.deepEqual(LOCALE_BCP47, {
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  en: "en",
  fr: "fr",
  ja: "ja",
  es: "es"
});

assert.equal(detectWebLiteLocale("zh-TW"), "zh-TW");
assert.equal(detectWebLiteLocale("zh-Hant-HK"), "zh-TW");
assert.equal(detectWebLiteLocale("zh-CN"), "zh");
assert.equal(detectWebLiteLocale("fr-CA"), "fr");
assert.equal(detectWebLiteLocale("ja-JP"), "ja");
assert.equal(detectWebLiteLocale("es-MX"), "es");
assert.equal(detectWebLiteLocale("de-DE"), "en");

for (const locale of locales) {
  const ai = getAIUiCopy(locale);
  const history = importHistoryCopy[locale];
  const toastCopy = {
    settingsSaved: ai.settingsSaved,
    apiKeyCleared: ai.apiKeyCleared,
    lyricsEmpty: ai.lyricsEmpty,
    translated: ai.translated,
    missingApiKey: getAIErrorMessage(locale, "missing_api_key"),
    missingModel: getAIErrorMessage(locale, "missing_model"),
    missingBaseUrl: getAIErrorMessage(locale, "missing_base_url"),
    exampleLoaded: settingsCopy[locale].exampleLoaded,
    clearAlreadyEmpty: settingsCopy[locale].clearAlreadyEmpty,
    lyricsLineLimitExceeded: messages[locale].lyricsLineLimitExceeded,
    exportCardUnavailable: messages[locale].exportCardUnavailable,
    exportFontsLoading: messages[locale].exportFontsLoading,
    exportCardMeasuring: messages[locale].exportCardMeasuring,
    exportContentOverflow: messages[locale].exportContentOverflow,
    exportFailed: messages[locale].exportFailed,
    exportBusy: messages[locale].exportBusy,
    historyRemoved: history.removed,
    historyCleared: history.cleared,
    historySaveFailed: history.historySaveFailed,
    replayFailed: history.replayFailed,
    replaySucceeded: history.replaySucceeded,
    fileMissing: history.fileMissing,
    fileChanged: history.fileChanged,
    relocateFailed: history.relocateFailed,
    corruptRecovered: history.corruptRecovered,
    manualSaveCreated: history.manualSaveCreated,
    manualSaveUpdated: history.manualSaveUpdated,
    manualSaveUnchanged: history.manualSaveUnchanged,
    manualSaveUnavailable: history.manualSaveUnavailable,
    manualSaveNotFound: history.manualSaveNotFound,
    manualSaveFailed: history.manualSaveFailed,
    manualSaveLoaded: history.manualSaveLoaded,
    webLiteClearAlreadyEmpty: webLiteCopy[locale].clearAlreadyEmpty,
    webLiteExportReady: webLiteCopy[locale].exportReady,
    webLiteExportFailed: webLiteCopy[locale].exportFailed
  };

  for (const [key, value] of Object.entries(toastCopy)) {
    assert.doesNotMatch(value, /[.!。！？!?；;：:]$/u, `toast copy must omit terminal punctuation: ${locale}.${key}`);
  }

  assert.deepEqual(placeholders(messages[locale].exportFailed), [], `${locale}.exportFailed hides diagnostics`);
  assert.deepEqual(placeholders(history.corruptRecovered), [], `${locale}.corruptRecovered hides backup filename`);
}

console.log("six-locale main, settings, AI, error, and Web Lite completeness tests passed");

function fromGetter(getter: (locale: Locale) => Record<string, string>) {
  return Object.fromEntries(locales.map((locale) => [locale, getter(locale)])) as Record<Locale, Record<string, string>>;
}

function assertCatalog(
  name: string,
  catalog: Record<Locale, Record<string, string>>,
  allowedEnglishEquality: Set<string>
) {
  const expectedKeys = Object.keys(catalog.en).sort();
  for (const locale of locales) {
    assert.deepEqual(Object.keys(catalog[locale]).sort(), expectedKeys, `${name}: ${locale} keys`);
    for (const key of expectedKeys) {
      const value = catalog[locale][key];
      assert.ok(value?.trim(), `${name}: ${locale}.${key} must not be blank`);
      assert.deepEqual(placeholders(value), placeholders(catalog.en[key]), `${name}: ${locale}.${key} placeholders`);
    }
  }

  for (const locale of translatedLocales) {
    const inherited = expectedKeys.filter((key) => catalog[locale][key] === catalog.en[key]);
    assert.deepEqual(
      inherited.filter((key) => !allowedEnglishEquality.has(key)),
      [],
      `${name}: ${locale} must not inherit English user copy`
    );
  }
}

function placeholders(value: string) {
  return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
}
