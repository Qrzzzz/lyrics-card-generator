export type SplitAlternatingLyricsResult = {
  lyrics: string;
  translationText: string;
};

export function splitAlternatingLyrics(text: string): SplitAlternatingLyricsResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const lyricLines: string[] = [];
  const translationLines: string[] = [];

  lines.forEach((line) => {
    if (isChineseTranslationLine(line)) {
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
