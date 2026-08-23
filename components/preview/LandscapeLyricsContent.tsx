"use client";

import { withAlpha } from "@/lib/palette-background";
import { cn } from "@/lib/utils";

export function LandscapeLyricsContent({
  lyrics,
  translationText,
  translationEnabled,
  lyricFontSize,
  translationScale,
  lineHeight,
  textColor,
  align,
  isDarkText,
  measurement = false
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
  measurement?: boolean;
}) {
  // Keep internal blank rows so bilingual documents retain their authored
  // alignment. Only leading/trailing empty rows are presentation noise; the
  // logical-line safety gate still counts non-empty lines independently.
  const lyricLines = splitUsefulLines(lyrics);
  const translationLines = splitUsefulLines(translationText ?? "");
  const visibleLyrics = lyricLines.length > 0 ? lyricLines : ["Type your lyrics here..."];
  const rowCount = Math.max(visibleLyrics.length, translationEnabled ? translationLines.length : 0);
  const translationFontSize = lyricFontSize * translationScale;
  const translationGap = lyricFontSize * 0.16;
  const rowGap = lyricFontSize * (translationEnabled ? 0.34 : 0.24);

  return (
    <div
      data-landscape-lyrics-content
      className={cn(
        "whitespace-pre-wrap break-words",
        align === "center" ? "text-center" : "text-left"
      )}
      style={{
        color: textColor,
        textShadow: isDarkText || measurement ? "none" : "0 10px 32px rgba(0,0,0,0.34)"
      }}
    >
      {Array.from({ length: rowCount }, (_, index) => {
        const lyric = visibleLyrics[index] ?? "";
        const translation = translationEnabled ? translationLines[index] ?? "" : "";
        return (
          <div key={`${index}:${lyric}:${translation}`} style={{ marginBottom: index === rowCount - 1 ? 0 : rowGap }}>
            {lyric ? (
              <p
                data-landscape-line="lyric"
                data-auto-width-line="lyric"
                data-auto-width-line-index={index}
                className="font-black opacity-[0.96]"
                style={{ fontSize: lyricFontSize, lineHeight }}
              >
                {lyric}
              </p>
            ) : null}
            {translation ? (
              <p
                data-landscape-line="translation"
                data-auto-width-line="translation"
                data-auto-width-line-index={index}
                className="font-semibold"
                style={{
                  marginTop: lyric ? translationGap : 0,
                  color: withAlpha(textColor, 0.68),
                  fontSize: translationFontSize,
                  lineHeight
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

export function splitUsefulLines(text: string) {
  const lines = text.split(/\r\n?|\n/).map((line) => line.trimEnd());
  while (lines.length > 0 && lines[0]?.trim().length === 0) lines.shift();
  while (lines.length > 0 && lines.at(-1)?.trim().length === 0) lines.pop();
  return lines;
}
