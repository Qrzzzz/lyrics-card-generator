"use client";

import { withAlpha } from "@/lib/palette-background";
import { cn } from "@/lib/utils";

export function LyricsBlock({
  lyrics,
  translationText,
  translationEnabled,
  lyricFontSize,
  translationScale,
  lineHeight,
  textColor,
  align,
  isDarkText,
  autoWidth = false
}: {
  lyrics: string;
  translationText?: string;
  translationEnabled: boolean;
  lyricFontSize: number;
  translationScale: number;
  lineHeight: number;
  textColor: string;
  align: "left" | "center";
  isDarkText: boolean;
  autoWidth?: boolean;
}) {
  const lyricLines = splitUsefulLines(lyrics);
  const translationLines = splitUsefulLines(translationText ?? "");
  const lines = lyricLines.length > 0 ? lyricLines : ["Type your lyrics here..."];
  const displayLineCount = Math.max(lines.length, translationEnabled ? translationLines.length : 0);
  const rows = Array.from({ length: displayLineCount }, (_, index) => ({
    hasLyric: index < lines.length,
    lyric: lines[index] ?? "",
    translation: translationEnabled ? translationLines[index] ?? "" : ""
  }));
  const activeLyricSize = Math.max(34, Math.min(lyricFontSize, rows.length > 10 ? lyricFontSize - 6 : lyricFontSize));
  const activeTranslationSize = Math.round(activeLyricSize * translationScale);
  const pairMargin = activeLyricSize * (translationEnabled ? 0.42 : 0.18);

  return (
    <div
      data-card-lyrics
      className={cn(
        "w-full max-h-full overflow-hidden whitespace-pre-wrap break-words",
        align === "center" ? "text-center" : "text-left"
      )}
      style={{
        color: textColor,
        textShadow: isDarkText ? "none" : "0 8px 28px rgba(0,0,0,0.34)"
      }}
    >
      {rows.map(({ hasLyric, lyric, translation }, index) => {
        return (
          <div key={`${lyric}-${translation}-${index}`} style={{ marginBottom: index === rows.length - 1 ? 0 : pairMargin }}>
            {hasLyric ? (
              <p
                data-auto-width-line="lyric"
                data-auto-width-line-index={index}
                className="font-black opacity-[0.96]"
                style={{
                  fontSize: activeLyricSize,
                  lineHeight,
                  textWrap: autoWidth ? "balance" : undefined
                }}
              >
                {lyric || "\u00a0"}
              </p>
            ) : null}
            {translation ? (
              <p
                data-auto-width-line="translation"
                data-auto-width-line-index={index}
                className={hasLyric ? "mt-[0.28em] font-medium" : "font-medium"}
                style={{
                  color: withAlpha(textColor, 0.64),
                  fontSize: activeTranslationSize,
                  lineHeight: 1.32,
                  textWrap: autoWidth ? "balance" : undefined
                }}
              >
                {translation}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function splitUsefulLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => line.trim().length > 0 || (index > 0 && index < lines.length - 1));
}
