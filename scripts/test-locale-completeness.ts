import assert from "node:assert/strict";
import { messages } from "../lib/i18n";
import { LOCALE_BCP47 } from "../lib/locale-language";
import type { Locale } from "../lib/types";

const locales: Locale[] = ["zh", "zh-TW", "en", "fr", "ja", "es"];
const expectedKeys = (Object.keys(messages.en) as Array<keyof typeof messages.en>).sort();
for (const locale of locales) {
  assert.deepEqual(Object.keys(messages[locale]).sort(), expectedKeys, `${locale} catalog keys`);
  for (const key of expectedKeys) {
    assert.ok(messages[locale][key]?.trim(), `${locale}.${key} must not be blank`);
  }
}

const allowedEnglish = new Set([
  "chinese", "english", "songSearchSourceNetease", "album", "auto", "gridDense",
  "generatedBy", "lyricsSource", "qualityHigh", "qualityLow", "madeWith"
]);
for (const locale of ["fr", "ja", "es"] as const) {
  const inherited = expectedKeys.filter((key) => messages[locale][key] === messages.en[key]);
  assert.deepEqual(inherited.filter((key) => !allowedEnglish.has(key)), [], `${locale} must not inherit English user copy`);
}

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

console.log("six-locale completeness and document-language tests passed");
