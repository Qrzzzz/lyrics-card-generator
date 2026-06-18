import type { Locale } from "./types";

export type SplitAlternatingLyricsResult = {
  lyrics: string;
  translationText: string;
};

type LatinLocale = Extract<Locale, "en" | "fr" | "es">;

const latinLanguageMarkers: Record<LatinLocale, Set<string>> = {
  en: new Set([
    "a",
    "am",
    "and",
    "are",
    "be",
    "but",
    "for",
    "from",
    "have",
    "i",
    "if",
    "in",
    "is",
    "it",
    "know",
    "love",
    "me",
    "my",
    "now",
    "of",
    "on",
    "that",
    "the",
    "this",
    "to",
    "we",
    "with",
    "you",
    "your"
  ]),
  fr: new Set([
    "au",
    "aux",
    "avec",
    "ce",
    "ces",
    "cette",
    "comme",
    "dans",
    "de",
    "des",
    "du",
    "elle",
    "en",
    "encore",
    "est",
    "et",
    "je",
    "la",
    "le",
    "les",
    "ma",
    "mais",
    "mes",
    "mon",
    "ne",
    "nous",
    "pas",
    "plus",
    "pour",
    "que",
    "qui",
    "soir",
    "sur",
    "ta",
    "tes",
    "toi",
    "ton",
    "tout",
    "tu",
    "un",
    "une",
    "vous"
  ]),
  es: new Set([
    "al",
    "amor",
    "como",
    "con",
    "de",
    "del",
    "el",
    "ella",
    "en",
    "esta",
    "este",
    "esto",
    "la",
    "las",
    "los",
    "mi",
    "mis",
    "no",
    "noche",
    "para",
    "pero",
    "por",
    "que",
    "si",
    "sin",
    "su",
    "sus",
    "te",
    "todo",
    "tu",
    "tus",
    "un",
    "una",
    "yo",
    "y"
  ])
};

export function splitAlternatingLyrics(text: string, translationLocale: Locale = "zh"): SplitAlternatingLyricsResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const lyricLines: string[] = [];
  const translationLines: string[] = [];

  lines.forEach((line) => {
    if (isTranslationLine(line, translationLocale)) {
      translationLines.push(line);
      return;
    }

    lyricLines.push(line);
  });

  return {
    lyrics: lyricLines.join("\n"),
    translationText: translationLines.join("\n")
  };
}

export function formatChineseTranslation(text: string) {
  return text.replace(/[\uFF0C,]/g, " ").replace(/[\u3002.]/g, "\n");
}

export function isTranslationLine(line: string, translationLocale: Locale) {
  switch (translationLocale) {
    case "zh":
    case "zh-TW":
      return isChineseTranslationLine(line);
    case "ja":
      return isJapaneseTranslationLine(line);
    case "en":
    case "fr":
    case "es":
      return isLatinTranslationLine(line, translationLocale);
    default:
      return false;
  }
}

export function isChineseTranslationLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  const hasHan = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(trimmed);
  if (!hasHan) {
    return false;
  }

  const hasJapaneseKana = /[\u3040-\u30FF\u31F0-\u31FF]/u.test(trimmed);
  const hasKoreanHangul = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/u.test(trimmed);

  return !hasJapaneseKana && !hasKoreanHangul;
}

export function isJapaneseTranslationLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  const hasJapaneseKana = /[\u3040-\u30FF\u31F0-\u31FF]/u.test(trimmed);
  const hasKoreanHangul = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/u.test(trimmed);

  return hasJapaneseKana && !hasKoreanHangul;
}

function isLatinTranslationLine(line: string, translationLocale: LatinLocale) {
  const trimmed = line.trim();
  if (!trimmed || /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF]/u.test(trimmed)) {
    return false;
  }

  const tokens = trimmed
    .toLocaleLowerCase("en-US")
    .match(/[a-zà-öø-ÿ]+(?:['’][a-zà-öø-ÿ]+)?/g);

  if (!tokens?.length) {
    return false;
  }

  const scores: Record<LatinLocale, number> = {
    en: scoreLatinLine(tokens, "en", trimmed),
    fr: scoreLatinLine(tokens, "fr", trimmed),
    es: scoreLatinLine(tokens, "es", trimmed)
  };
  const targetScore = scores[translationLocale];
  const strongestOtherScore = Math.max(...(Object.keys(scores) as LatinLocale[]).filter((locale) => locale !== translationLocale).map((locale) => scores[locale]));

  return targetScore >= 2 && targetScore > strongestOtherScore;
}

function scoreLatinLine(tokens: string[], locale: LatinLocale, rawLine: string) {
  const markerScore = tokens.reduce((score, token) => score + (latinLanguageMarkers[locale].has(token) ? 1 : 0), 0);

  if (locale === "fr") {
    const accentScore = /[àâæçéèêëîïôœùûüÿ]/i.test(rawLine) ? 2 : 0;
    const elisionScore = /\b[cdjlmnst]['’]/i.test(rawLine) ? 2 : 0;
    return markerScore + accentScore + elisionScore;
  }

  if (locale === "es") {
    const accentScore = /[áéíóúüñ¿¡]/i.test(rawLine) ? 2 : 0;
    return markerScore + accentScore;
  }

  const asciiTokenCount = tokens.filter((token) => /^[a-z]+(?:['’][a-z]+)?$/i.test(token)).length;
  return markerScore + (asciiTokenCount === tokens.length ? 1 : 0);
}
