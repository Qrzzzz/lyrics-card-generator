"use client";

import { withAlpha } from "@/lib/palette-background";
import { getLandscapeTypography } from "@/lib/landscape-typography";
import { cn } from "@/lib/utils";

export function LandscapeLyricsBlock({
  lyrics,
  translationText,
  translationEnabled,
  lyricFontSize,
  translationScale,
  lineHeight,
  textColor,
  left,
  top,
  width,
  maxHeight,
  cardWidth,
  cardHeight,
  isDarkText
}: {
  lyrics: string;
  translationText?: string;
  translationEnabled: boolean;
  lyricFontSize: number;
  translationScale: number;
  lineHeight: number;
  textColor: string;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  cardWidth: number;
  cardHeight: number;
  isDarkText: boolean;
}) {
  const lyricLines = splitUsefulLines(lyrics);
  const translationLines = splitUsefulLines(translationText ?? "");
  const lines = lyricLines.length > 0 ? lyricLines : ["Type your lyrics here..."];
  const hasTranslation = translationEnabled && translationLines.length > 0;
  const visualLineCount = estimateVisualLineCount(lines, width, lyricFontSize);
  const typography = getLandscapeTypography({
    width: cardWidth,
    height: cardHeight,
    lineCount: visualLineCount,
    hasTranslation,
    contentMode: "lyrics",
    maxHeight,
    lineHeight
  });
  const activeLyricSize = Math.max(24, Math.min(lyricFontSize, typography.lyricFontSize));
  const activeTranslationSize = Math.round(
    Math.min(typography.translationFontSize, activeLyricSize * Math.min(0.52, Math.max(0.45, translationScale)))
  );
  const pairMargin = typography.pairGap;

  return (
    <div
      className="absolute z-10 overflow-hidden text-left whitespace-pre-wrap break-words"
      style={{
        left,
        top,
        width,
        height: maxHeight,
        maxHeight,
        color: textColor,
        textShadow: isDarkText ? "none" : "0 10px 32px rgba(0,0,0,0.34)"
      }}
    >
      {lines.map((line, index) => {
        const translation = translationEnabled ? translationLines[index] : "";

        return (
          <div key={`${line}-${index}`} style={{ marginBottom: index === lines.length - 1 ? 0 : pairMargin }}>
            <p
              className={cn("font-black opacity-[0.96]")}
              style={{
                fontSize: activeLyricSize,
                lineHeight
              }}
            >
              {line || "\u00a0"}
            </p>
            {translation ? (
              <p
                className="font-semibold"
                style={{
                  marginTop: typography.lyricLineGap,
                  color: withAlpha(textColor, 0.68),
                  fontSize: activeTranslationSize,
                  lineHeight: 1.28
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

function estimateVisualLineCount(lines: string[], width: number, fontSize: number) {
  const averageCharWidth = Math.max(12, fontSize * 0.54);
  const charsPerLine = Math.max(8, Math.floor(width / averageCharWidth));

  return lines.reduce((count, line) => count + Math.max(1, Math.ceil(line.trim().length / charsPerLine)), 0);
}
