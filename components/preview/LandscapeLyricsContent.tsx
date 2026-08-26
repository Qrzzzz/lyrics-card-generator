"use client";

import { withAlpha } from "@/lib/palette-background";
import { getLyricDocumentRows, type LyricDocumentV2 } from "@/lib/lyrics-document-v2";
import { cn } from "@/lib/utils";

export function LandscapeLyricsContent({
  lyricDocument,
  translationEnabled,
  lyricFontSize,
  translationScale,
  lineHeight,
  textColor,
  align,
  isDarkText,
  measurement = false
}: {
  lyricDocument: LyricDocumentV2;
  translationEnabled: boolean;
  lyricFontSize: number;
  translationScale: number;
  lineHeight: number;
  textColor: string;
  align: "left" | "center";
  isDarkText: boolean;
  measurement?: boolean;
}) {
  const documentRows = getLyricDocumentRows(lyricDocument);
  const rows = documentRows.length > 0
    ? documentRows
    : [{
        blockId: "placeholder",
        unitId: "placeholder",
        source: ["Type your lyrics here..."],
        translation: [],
        isBlockStart: true,
        sourceGapBeforeLines: 0,
        translationGapBeforeLines: 0
      }];
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
      {rows.map((row, index) => {
        const lyric = row.source.join("\n");
        const translation = translationEnabled ? row.translation.join("\n") : "";
        const gapBeforeLines = row.isBlockStart
          ? Math.max(row.sourceGapBeforeLines, translationEnabled ? row.translationGapBeforeLines : 0)
          : 0;
        return (
          <div
            key={row.unitId}
            data-lyric-unit-id={row.unitId === "placeholder" ? undefined : row.unitId}
            style={{
              marginTop: index > 0 ? gapBeforeLines * rowGap : 0,
              marginBottom: index === rows.length - 1 ? 0 : rowGap
            }}
          >
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

/** @deprecated Compatibility helper retained for layout regression tests. */
export function splitUsefulLines(text: string) {
  const lines = text.split(/\r\n?|\n/).map((line) => line.trimEnd());
  while (lines.length > 0 && lines[0]?.trim().length === 0) lines.shift();
  while (lines.length > 0 && lines.at(-1)?.trim().length === 0) lines.pop();
  return lines;
}
