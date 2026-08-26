"use client";

import { withAlpha } from "@/lib/palette-background";
import { getLyricDocumentRows, type LyricDocumentV2 } from "@/lib/lyrics-document-v2";
import { cn } from "@/lib/utils";

export function LyricsBlock({
  lyricDocument,
  translationEnabled,
  lyricFontSize,
  translationScale,
  lineHeight,
  textColor,
  align,
  isDarkText,
  autoWidth = false
}: {
  lyricDocument: LyricDocumentV2;
  translationEnabled: boolean;
  lyricFontSize: number;
  translationScale: number;
  lineHeight: number;
  textColor: string;
  align: "left" | "center";
  isDarkText: boolean;
  autoWidth?: boolean;
}) {
  const documentRows = getLyricDocumentRows(lyricDocument);
  const rows = documentRows.length > 0
    ? documentRows.map((row) => ({
        key: row.unitId,
        hasLyric: row.source.length > 0,
        lyric: row.source.join("\n"),
        translation: translationEnabled ? row.translation.join("\n") : "",
        gapBeforeLines: row.isBlockStart
          ? Math.max(row.sourceGapBeforeLines, translationEnabled ? row.translationGapBeforeLines : 0)
          : 0
      }))
    : [{ key: "placeholder", hasLyric: true, lyric: "Type your lyrics here...", translation: "", gapBeforeLines: 0 }];
  const visualRowCount = rows.length + rows.reduce((total, row) => total + row.gapBeforeLines, 0);
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
      style={{
        color: textColor,
        textShadow: isDarkText ? "none" : "0 8px 28px rgba(0,0,0,0.34)"
      }}
    >
      {rows.map(({ key, hasLyric, lyric, translation, gapBeforeLines }, index) => {
        return (
          <div
            key={key}
            data-lyric-unit-id={key === "placeholder" ? undefined : key}
            style={{
              marginTop: index > 0
                ? gapBeforeLines * ((activeLyricSize * lineHeight) + (pairMargin * 2))
                : 0,
              marginBottom: index === rows.length - 1 ? 0 : pairMargin
            }}
          >
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
