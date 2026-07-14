"use client";

import { Languages, SplitSquareVertical } from "lucide-react";
import type { ReactNode } from "react";
import { AiTranslateButton } from "@/components/lyrics/AiTranslateButton";
import { ActionButton, ToggleRow } from "@/components/ui/controls";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { createT } from "@/lib/i18n";
import { formatChineseTranslation, splitAlternatingLyrics } from "@/lib/lyric-format";
import type { Locale } from "@/lib/types";

export type LyricsToolsLabels = {
  tools: string;
};

type LyricsToolsAsideProps = {
  lyrics: string;
  translationEnabled: boolean;
  translationText: string;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translation: string) => void;
  onSplitAlternatingLyrics: (lyrics: string, translationText: string) => void;
  onAITranslate: () => void;
  isAITranslating: boolean;
  showAiTranslate: boolean;
  themeColor: string;
  locale: Locale;
  t: ReturnType<typeof createT>;
  labels: LyricsToolsLabels;
  lyricsFetchPanel?: ReactNode;
  aiPanel?: ReactNode;
};

export function LyricsToolsAside({
  lyrics,
  translationEnabled,
  translationText,
  onTranslationEnabledChange,
  onTranslationTextChange,
  onSplitAlternatingLyrics,
  onAITranslate,
  isAITranslating,
  showAiTranslate,
  themeColor,
  locale,
  t,
  labels,
  lyricsFetchPanel,
  aiPanel
}: LyricsToolsAsideProps) {
  const aiCopy = getAIUiCopy(locale);

  return (
    <aside
      className="lyrics-workspace-column lyrics-tools-aside app-text-muted h-full min-h-0 overflow-hidden p-3"
      aria-label={labels.tools}
    >
      <div className="lyrics-tools-aside__body flex h-full min-h-0 flex-col gap-4">
        <section className="lyrics-tools-aside__actions grid shrink-0 gap-2" aria-labelledby="lyrics-tools-title">
          <p id="lyrics-tools-title" className="app-text-primary text-sm font-semibold">
            {labels.tools}
          </p>
          {showAiTranslate ? (
            <div className="lyrics-tool-ai min-w-0">
              <AiTranslateButton
                label={isAITranslating ? aiCopy.translating : aiCopy.aiTranslate}
                loading={isAITranslating}
                themeColor={themeColor}
                onClick={onAITranslate}
              />
            </div>
          ) : null}
          <ActionButton
            size="sm"
            icon={<SplitSquareVertical className="h-4 w-4" />}
            onClick={() => {
              const result = splitAlternatingLyrics(lyrics, locale);
              onSplitAlternatingLyrics(result.lyrics, result.translationText);
            }}
            className="lyrics-tool-split w-full justify-start"
            title={t("splitAlternatingLyrics")}
          >
            {t("splitAlternatingLyrics")}
          </ActionButton>
          <ToggleRow
            label={t("enableTranslation")}
            checked={translationEnabled}
            onChange={onTranslationEnabledChange}
            size="sm"
            testId="translation-toggle"
            className="lyrics-tool-translation"
          />
          {locale === "zh" && translationEnabled ? (
            <ActionButton
              size="sm"
              icon={<Languages className="h-4 w-4" />}
              onClick={() => onTranslationTextChange(formatChineseTranslation(translationText))}
              className="lyrics-tool-format w-full justify-start"
              title={t("formatChineseTranslation")}
            >
              {t("formatChineseTranslation")}
            </ActionButton>
          ) : null}
        </section>

        {lyricsFetchPanel ? (
          <div
            className="min-h-16 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--input-bg))] p-2"
            data-testid="lyrics-fetch-panel-boundary"
          >
            {lyricsFetchPanel}
          </div>
        ) : null}
        {aiPanel ? (
          <div
            className="min-h-16 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--input-bg))] p-2"
            data-testid="lyrics-ai-panel-boundary"
          >
            {aiPanel}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
