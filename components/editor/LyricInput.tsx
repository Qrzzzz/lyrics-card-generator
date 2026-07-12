"use client";

import { Languages, SplitSquareVertical } from "lucide-react";
import { type ReactNode, useId } from "react";
import { LyricsWorkspace } from "@/components/editor/LyricsWorkspace";
import { AiTranslateButton } from "@/components/lyrics/AiTranslateButton";
import { TranslationFieldBorder } from "@/components/lyrics/TranslationFieldBorder";
import { ActionButton, FieldLabel, Section, TextareaField, ToggleRow } from "@/components/ui/controls";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { createT } from "@/lib/i18n";
import type { ExportLyricLineStatus } from "@/lib/lyrics-document";
import { formatChineseTranslation, splitAlternatingLyrics } from "@/lib/lyric-format";
import type { ContentMode, Locale, SongInfo } from "@/lib/types";

export function LyricInput({
  lyrics,
  song,
  lineStatus,
  presentation = "legacy",
  onLyricsChange,
  translationEnabled,
  translationText,
  onTranslationEnabledChange,
  onTranslationTextChange,
  onSplitAlternatingLyrics,
  onAITranslate,
  isAITranslating,
  aiTranslatePanel,
  lyricsFetchPanel,
  themeColor,
  contentMode,
  locale,
  t,
  showAiTranslate = true
}: {
  lyrics: string;
  song?: SongInfo;
  lineStatus?: ExportLyricLineStatus;
  presentation?: "legacy" | "workspace";
  onLyricsChange: (lyrics: string) => void;
  translationEnabled: boolean;
  translationText: string;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translation: string) => void;
  onSplitAlternatingLyrics: (lyrics: string, translationText: string) => void;
  onAITranslate: () => void;
  isAITranslating: boolean;
  aiTranslatePanel?: ReactNode;
  lyricsFetchPanel?: ReactNode;
  themeColor: string;
  contentMode: ContentMode;
  locale: Locale;
  t: ReturnType<typeof createT>;
  showAiTranslate?: boolean;
}) {
  const translationFieldId = useId();

  if (presentation === "workspace" && song && lineStatus) {
    return (
    <LyricsWorkspace
      lyrics={lyrics}
      song={song}
      lineStatus={lineStatus}
      onLyricsChange={onLyricsChange}
      translationEnabled={translationEnabled}
      translationText={translationText}
      onTranslationEnabledChange={onTranslationEnabledChange}
      onTranslationTextChange={onTranslationTextChange}
      onSplitAlternatingLyrics={onSplitAlternatingLyrics}
      onAITranslate={onAITranslate}
      isAITranslating={isAITranslating}
      aiPanel={aiTranslatePanel}
      lyricsFetchPanel={lyricsFetchPanel}
      themeColor={themeColor}
      contentMode={contentMode}
      locale={locale}
      t={t}
      showAiTranslate={showAiTranslate}
    />
    );
  }

  const lines = lyrics ? lyrics.split(/\r?\n/).length : 0;
  const showTranslation = contentMode === "lyrics" && translationEnabled;
  const aiCopy = getAIUiCopy(locale);

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
