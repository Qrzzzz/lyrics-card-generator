"use client";

import { Languages, SplitSquareVertical } from "lucide-react";
import { type ReactNode, useId } from "react";
import { AiTranslateButton } from "@/components/lyrics/AiTranslateButton";
import { TranslationFieldBorder } from "@/components/lyrics/TranslationFieldBorder";
import { ActionButton, FieldLabel, Section, TextareaField, ToggleRow } from "@/components/ui/controls";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
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
  onAITranslate,
  isAITranslating,
  aiTranslatePanel,
  themeColor,
  contentMode,
  locale,
  t,
  showAiTranslate = true
}: {
  lyrics: string;
  onLyricsChange: (lyrics: string) => void;
  translationEnabled: boolean;
  translationText: string;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translation: string) => void;
  onSplitAlternatingLyrics: (lyrics: string, translationText: string) => void;
  onAITranslate: () => void;
  isAITranslating: boolean;
  aiTranslatePanel?: ReactNode;
  themeColor: string;
  contentMode: ContentMode;
  locale: Locale;
  t: ReturnType<typeof createT>;
  showAiTranslate?: boolean;
}) {
  const lines = lyrics ? lyrics.split(/\r?\n/).length : 0;
  const showTranslation = contentMode === "lyrics" && translationEnabled;
  const aiCopy = getAIUiCopy(locale);
  const translationFieldId = useId();

  return (
    <Section title={t("lyrics")} eyebrow={t("manualText")}>
      {contentMode === "lyrics" ? (
        <>
          <FieldLabel label={t("lyricText")} hint={t("lineCount", { lines, chars: lyrics.length })}>
            <TextareaField
              value={lyrics}
              onChange={(event) => onLyricsChange(event.target.value)}
              placeholder={t("lyricPlaceholder")}
              className="min-h-52 leading-relaxed"
            />
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {showAiTranslate ? (
              <AiTranslateButton
                label={isAITranslating ? aiCopy.translating : aiCopy.aiTranslate}
                loading={isAITranslating}
                themeColor={themeColor}
                onClick={onAITranslate}
              />
            ) : null}
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
          {aiTranslatePanel}
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
