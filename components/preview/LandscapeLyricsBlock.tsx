"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { withAlpha } from "@/lib/palette-background";
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
  align,
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
  align: "left" | "center";
  isDarkText: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lyricLines = splitUsefulLines(lyrics);
  const translationLines = splitUsefulLines(translationText ?? "");
  const lines = lyricLines.length > 0 ? lyricLines : ["Type your lyrics here..."];
  const hasTranslation = translationEnabled && translationLines.length > 0;
  const displayLineCount = Math.max(lines.length, translationEnabled ? translationLines.length : 0);
  const rows = Array.from({ length: displayLineCount }, (_, index) => ({
    hasLyric: index < lines.length,
    lyric: lines[index] ?? "",
    translation: translationEnabled ? translationLines[index] ?? "" : ""
  }));
  const targetLyricSize = useMemo(() => Math.max(24, lyricFontSize), [lyricFontSize]);
  const [activeLyricSize, setActiveLyricSize] = useState(targetLyricSize);
  const activeTranslationSize = Math.round(
    activeLyricSize * Math.min(0.56, Math.max(0.45, translationScale))
  );
  const pairMargin = Math.round(activeLyricSize * (hasTranslation ? 0.28 : 0.18));
  const lyricLineGap = Math.round(activeLyricSize * (hasTranslation ? 0.16 : 0.2));

  useEffect(() => {
    setActiveLyricSize(targetLyricSize);
  }, [targetLyricSize, lyrics, translationText, translationEnabled, lineHeight, width, maxHeight]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) {
      return;
    }

    // Each frame reduces only enough to remove measured overflow, stopping at the readability floor.
    let cancelled = false;
    const fit = () => {
      if (cancelled) {
        return;
      }

      const overflow = node.scrollHeight - maxHeight;
      if (overflow <= 1) {
        return;
      }

      setActiveLyricSize((current) => {
        if (current <= 24) {
          return current;
        }

        const lineCount = Math.max(1, lines.length + (hasTranslation ? translationLines.length : 0));
        const step = Math.max(1, Math.ceil(overflow / Math.max(1, lineCount * lineHeight)));
        return Math.max(24, current - step);
      });
    };

    const frame = requestAnimationFrame(fit);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [activeLyricSize, hasTranslation, lineHeight, lines.length, maxHeight, translationLines.length]);

  return (
    <div
      ref={rootRef}
      data-card-lyrics
      className={cn(
        "absolute z-10 overflow-hidden whitespace-pre-wrap break-words",
        align === "center" ? "text-center" : "text-left"
      )}
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
      {rows.map(({ hasLyric, lyric, translation }, index) => {
        return (
          <div key={`${lyric}-${translation}-${index}`} style={{ marginBottom: index === rows.length - 1 ? 0 : pairMargin }}>
            {hasLyric ? (
              <p
                className={cn("font-black opacity-[0.96]")}
                style={{
                  fontSize: activeLyricSize,
                  lineHeight
                }}
              >
                {lyric || "\u00a0"}
              </p>
            ) : null}
            {translation ? (
              <p
                className="font-semibold"
                style={{
                  marginTop: hasLyric ? lyricLineGap : 0,
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
