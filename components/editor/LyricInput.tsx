"use client";

import { Textarea, Label, Section, SwitchRow } from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import type { ContentMode } from "@/lib/types";

export function LyricInput({
  lyrics,
  onLyricsChange,
  translationEnabled,
  translationText,
  onTranslationEnabledChange,
  onTranslationTextChange,
  contentMode,
  t
}: {
  lyrics: string;
  onLyricsChange: (lyrics: string) => void;
  translationEnabled: boolean;
  translationText: string;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translation: string) => void;
  contentMode: ContentMode;
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
          <SwitchRow label={t("enableTranslation")} checked={translationEnabled} onChange={onTranslationEnabledChange} />
          {showTranslation ? (
            <Label label={t("translation")}>
              <Textarea
                value={translationText}
                onChange={(event) => onTranslationTextChange(event.target.value)}
                placeholder={t("translationPlaceholder")}
                className="min-h-40 leading-relaxed"
              />
            </Label>
          ) : null}
        </>
      ) : (
        <p className="app-text-subtle text-sm">{t("instrumentalMode")}</p>
      )}
    </Section>
  );
}
