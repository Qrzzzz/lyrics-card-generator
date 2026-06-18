"use client";

import { Languages, SplitSquareVertical } from "lucide-react";
import { Textarea, Label, Section, SwitchRow } from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import { formatChineseTranslation, splitAlternatingLyrics } from "@/lib/lyric-format";
import type { ContentMode, Locale } from "@/lib/types";

export function LyricInput({
  lyrics,
  onLyricsChange,
  translationEnabled,
  translationText,
  onTranslationEnabledChange,
  onTranslationTextChange,
  onSplitAlternatingLyrics,
  contentMode,
  locale,
  t
}: {
  lyrics: string;
  onLyricsChange: (lyrics: string) => void;
  translationEnabled: boolean;
  translationText: string;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translation: string) => void;
  onSplitAlternatingLyrics: (lyrics: string, translationText: string) => void;
  contentMode: ContentMode;
  locale: Locale;
  t: ReturnType<typeof createT>;
}) {
  const lines = lyrics ? lyrics.split(/\r?\n/).length : 0;
  const showTranslation = contentMode === "lyrics" && translationEnabled;

  return (
    <Section title={t("lyrics")} eyebrow={t("manualText")}>
      {contentMode === "lyrics" ? (
        <>
          <Label label={t("lyricText")} hint={t("lineCount", { lines, chars: lyrics.length })}>
            <Textarea
              value={lyrics}
              onChange={(event) => onLyricsChange(event.target.value)}
              placeholder={t("lyricPlaceholder")}
              className="min-h-52 leading-relaxed"
            />
          </Label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const result = splitAlternatingLyrics(lyrics, locale);
                onSplitAlternatingLyrics(result.lyrics, result.translationText);
              }}
              className="app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition"
            >
              <SplitSquareVertical className="h-4 w-4" />
              {t("splitAlternatingLyrics")}
            </button>
          </div>
          <SwitchRow label={t("enableTranslation")} checked={translationEnabled} onChange={onTranslationEnabledChange} />
          {showTranslation ? (
            <Label label={t("translation")}>
              <Textarea
                value={translationText}
                onChange={(event) => onTranslationTextChange(event.target.value)}
                placeholder={t("translationPlaceholder")}
                className="min-h-40 leading-relaxed"
              />
              {locale === "zh" ? (
                <button
                  type="button"
                  onClick={() => onTranslationTextChange(formatChineseTranslation(translationText))}
                  className="app-button mt-2 inline-flex h-10 w-fit items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition"
                >
                  <Languages className="h-4 w-4" />
                  {t("formatChineseTranslation")}
                </button>
              ) : null}
            </Label>
          ) : null}
        </>
      ) : (
        <p className="app-text-subtle text-sm">{t("instrumentalMode")}</p>
      )}
    </Section>
  );
}
