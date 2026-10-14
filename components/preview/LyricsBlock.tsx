"use client";

import { withAlpha } from "@/lib/palette-background";
import { getLyricDocumentRows, type LyricDocumentV2 } from "@/lib/lyrics-document-v2";
import { cn } from "@/lib/utils";
import { LyricSeparator } from "@/components/preview/LyricSeparator";
import type { LyricSeparatorStyle } from "@/lib/lyric-separator";
import { LyricTextLines } from "@/components/preview/LyricTextLines";

export function LyricsBlock({
  lyricDocument,
  translationEnabled,
  lyricFontSize,
  translationScale,
  lineHeight,
  textColor,
  align,
  separatorStyle = "dot",
  autoWidth = false
}: {
  lyricDocument: LyricDocumentV2;
  translationEnabled: boolean;
  lyricFontSize: number;
  translationScale: number;
  lineHeight: number;
  textColor: string;
  align: "left" | "center";
  separatorStyle?: LyricSeparatorStyle;
  autoWidth?: boolean;
}) {
  const documentRows = getLyricDocumentRows(lyricDocument);
  const rows = documentRows.length > 0
    ? documentRows.map((row) => ({
        key: row.unitId,
        isSeparator: row.isSeparator,
        hasLyric: row.source.length > 0,
        lyric: row.source,
        translation: translationEnabled ? row.translation : [],
        gapBeforeLines: row.isBlockStart
          ? Math.max(row.sourceGapBeforeLines, translationEnabled ? row.translationGapBeforeLines : 0)
          : 0
      }))
    : [{ key: "placeholder", isSeparator: false, hasLyric: true, lyric: ["Type your lyrics here..."], translation: [], gapBeforeLines: 0 }];
  const visualRowCount = rows.reduce((total, row, index) => total + (row.isSeparator ? 0
    : 1 + (rows[index - 1]?.isSeparator ? 0 : row.gapBeforeLines)), 0);
  const activeLyricSize = Math.max(34, Math.min(lyricFontSize, visualRowCount > 10 ? lyricFontSize - 6 : lyricFontSize));
  const activeTranslationSize = Math.round(activeLyricSize * translationScale);
  const pairMargin = activeLyricSize * (translationEnabled ? 0.42 : 0.18);

  return (
    <div
      data-card-lyrics
      className={cn(
        "w-full max-h-full overflow-hidden whitespace-pre-wrap break-words",
        align === "center" ? "text-center" : "text-left"
      )}
      style={{ color: textColor }}
    >
      {rows.map(({ key, isSeparator, hasLyric, lyric, translation, gapBeforeLines }, index) => {
        if (isSeparator) return <LyricSeparator key={key} style={separatorStyle} fontSize={activeLyricSize} color={textColor} />;
        return (
          <div
            key={key}
            data-lyric-unit-id={key === "placeholder" ? undefined : key}
            style={{
              marginTop: index > 0 && !rows[index - 1]?.isSeparator
                ? gapBeforeLines * ((activeLyricSize * lineHeight) + (pairMargin * 2))
                : 0,
              marginBottom: index === rows.length - 1 ? 0 : pairMargin
            }}
          >
            {hasLyric ? (
              <LyricTextLines
                lines={lyric}
                kind="lyric"
                rowIndex={index}
                className="font-black opacity-[0.96]"
                fontSize={activeLyricSize}
                lineHeight={lineHeight}
                style={{
                  textWrap: autoWidth ? "balance" : undefined
                }}
              />
            ) : null}
            {translation.length > 1 || translation.some((line) => line.length > 0) ? (
              <LyricTextLines
                lines={translation}
                kind="translation"
                rowIndex={index}
                className="font-medium"
                fontSize={activeTranslationSize}
                lineHeight={lineHeight}
                style={{
                  marginTop: hasLyric ? activeTranslationSize * 0.28 : 0,
                  color: withAlpha(textColor, 0.64),
                  textWrap: autoWidth ? "balance" : undefined
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
