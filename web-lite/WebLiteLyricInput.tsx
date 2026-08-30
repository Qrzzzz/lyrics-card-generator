"use client";

import { Languages, SplitSquareVertical } from "lucide-react";
import { useId } from "react";
import { TranslationFieldBorder } from "@/components/lyrics/TranslationFieldBorder";
import {
  LandscapeLineLimitAlert,
  type LandscapeLineLimitNotice
} from "@/components/editor/LandscapeLineLimitAlert";
import { ActionButton, FieldLabel, Section, TextareaField, ToggleRow } from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import { formatChineseTranslation, splitAlternatingLyrics } from "@/lib/lyric-format";
import type { ContentMode, Locale } from "@/lib/types";

export function WebLiteLyricInput({
  lyrics,
  onLyricsChange,
  translationEnabled,
  translationText,
  onTranslationEnabledChange,
  onTranslationTextChange,
  onSplitAlternatingLyrics,
  themeColor,
  contentMode,
  locale,
  t,
  landscapeLineLimitNotice,
  onDismissLandscapeLineLimitNotice
}: {
  lyrics: string;
  onLyricsChange: (lyrics: string) => void;
  translationEnabled: boolean;
  translationText: string;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translation: string) => void;
  onSplitAlternatingLyrics: (lyrics: string, translationText: string) => void;
  themeColor: string;
  contentMode: ContentMode;
  locale: Locale;
  t: ReturnType<typeof createT>;
  landscapeLineLimitNotice: LandscapeLineLimitNotice | null;
  onDismissLandscapeLineLimitNotice: () => void;
}) {
  const translationFieldId = useId();
  const lines = lyrics ? lyrics.split(/\r?\n/).length : 0;
  const showTranslation = contentMode === "lyrics" && translationEnabled;

  return (
    <Section title={t("lyrics")} eyebrow={t("manualText")}>
      {contentMode === "lyrics" ? (
        <>
          <LandscapeLineLimitAlert
            notice={landscapeLineLimitNotice}
            onDismiss={onDismissLandscapeLineLimitNotice}
            t={t}
          />
          <FieldLabel label={t("lyricText")} hint={t("lineCount", { lines, chars: lyrics.length })}>
            <TextareaField
              data-testid="web-lite-lyrics-original"
              value={lyrics}
              onChange={(event) => onLyricsChange(event.target.value)}
              placeholder={t("lyricPlaceholder")}
              className="min-h-52 leading-relaxed"
            />
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              size="md"
              icon={<SplitSquareVertical className="h-4 w-4" />}
              onClick={() => {
                const result = splitAlternatingLyrics(lyrics, locale);
                onSplitAlternatingLyrics(result.lyrics, result.translationText);
              }}
            >
              {t("splitAlternatingLyrics")}
            </ActionButton>
          </div>
          <ToggleRow label={t("enableTranslation")} checked={translationEnabled} onChange={onTranslationEnabledChange} />
          {showTranslation ? (
            <FieldLabel label={t("translation")} htmlFor={translationFieldId}>
              <TranslationFieldBorder color={themeColor}>
                <TextareaField
                  id={translationFieldId}
                  value={translationText}
                  onChange={(event) => onTranslationTextChange(event.target.value)}
                  placeholder={t("translationPlaceholder")}
                  className="min-h-40 leading-relaxed"
                />
              </TranslationFieldBorder>
              {locale === "zh" ? (
                <ActionButton
                  size="sm"
                  icon={<Languages className="h-4 w-4" />}
                  onClick={() => onTranslationTextChange(formatChineseTranslation(translationText))}
                  className="mt-2"
                >
                  {t("formatChineseTranslation")}
                </ActionButton>
              ) : null}
            </FieldLabel>
          ) : null}
        </>
      ) : (
        <p className="app-text-subtle text-sm">{t("instrumentalMode")}</p>
      )}
    </Section>
  );
}
