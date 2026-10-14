"use client";

import { withAlpha } from "@/lib/palette-background";
import { getLyricDocumentRows, type LyricDocumentV2 } from "@/lib/lyrics-document-v2";
import { cn } from "@/lib/utils";
import { LyricSeparator } from "@/components/preview/LyricSeparator";
import type { LyricSeparatorStyle } from "@/lib/lyric-separator";
import { LyricTextLines } from "@/components/preview/LyricTextLines";

export function LandscapeLyricsContent({
  lyricDocument,
  translationEnabled,
  lyricFontSize,
  translationScale,
  lineHeight,
  textColor,
  align,
  separatorStyle = "dot",
  measurement = false,
  inkTop = 0,
  inkBottom = 0,
  targetHeight
}: {
  lyricDocument: LyricDocumentV2;
  translationEnabled: boolean;
  lyricFontSize: number;
  translationScale: number;
  lineHeight: number;
  textColor: string;
  align: "left" | "center";
  separatorStyle?: LyricSeparatorStyle;
  measurement?: boolean;
  inkTop?: number;
  inkBottom?: number;
  targetHeight?: number;
}) {
  const documentRows = getLyricDocumentRows(lyricDocument);
  const rows = documentRows.length > 0
    ? documentRows
    : [{
        blockId: "placeholder",
        unitId: "placeholder",
        isSeparator: false,
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
      style={{ color: textColor, textShadow: measurement ? "none" : undefined,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        height: targetHeight === undefined ? undefined : targetHeight + inkTop + inkBottom,
      }}
    >
      {rows.map((row, index) => {
        if (row.isSeparator) return <LyricSeparator key={row.unitId} style={separatorStyle} fontSize={lyricFontSize} color={textColor} />;
        const hasLyric = row.source.length > 1 || row.source.some((line) => line.length > 0);
        const translation = translationEnabled ? row.translation : [];
        const gapBeforeLines = row.isBlockStart
          ? Math.max(row.sourceGapBeforeLines, translationEnabled ? row.translationGapBeforeLines : 0)
          : 0;
        return (
          <div
            key={row.unitId}
            data-lyric-unit-id={row.unitId === "placeholder" ? undefined : row.unitId}
            style={{
              flexShrink: 0,
              // Flex items do not collapse adjacent margins; preserve the
              // former block layout's max(previous gap, requested gap).
              marginTop: index > 0 && !rows[index - 1]?.isSeparator ? Math.max(0, gapBeforeLines - 1) * rowGap : 0,
              marginBottom: index === rows.length - 1 ? 0 : rowGap
            }}
          >
            {hasLyric ? (
              <LyricTextLines
                lines={row.source}
                kind="lyric"
                rowIndex={index}
                landscape
                className="font-black opacity-[0.96]"
                fontSize={lyricFontSize}
                lineHeight={lineHeight}
              />
            ) : null}
            {translation.length > 1 || translation.some((line) => line.length > 0) ? (
              <LyricTextLines
                lines={translation}
                kind="translation"
                rowIndex={index}
                landscape
                className="font-semibold"
                fontSize={translationFontSize}
                lineHeight={lineHeight}
                style={{
                  marginTop: hasLyric ? translationGap : 0,
                  color: withAlpha(textColor, 0.68)
                }}
              />
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
