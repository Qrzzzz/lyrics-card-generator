"use client";

import { Languages, SplitSquareVertical } from "lucide-react";
import type { ReactNode } from "react";
import { AiTranslateButton } from "@/components/lyrics/AiTranslateButton";
import { ActionButton, ToggleRow } from "@/components/ui/controls";
import type { LyricsViewportMode } from "@/components/editor/hooks/useLyricsViewportSession";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { createT } from "@/lib/i18n";
import { formatChineseTranslation, splitAlternatingLyrics } from "@/lib/lyric-format";
import type { Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

export type LyricsToolsLabels = {
  tools: string;
  viewMode: string;
  standard: string;
  expanded: string;
  immersive: string;
  immersiveExitHint: string;
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
  mode: LyricsViewportMode;
  onModeChange: (mode: LyricsViewportMode) => void;
  labels: LyricsToolsLabels;
  lyricsFetchPanel?: ReactNode;
  aiPanel?: ReactNode;
};

const VIEWPORT_MODES: LyricsViewportMode[] = ["standard", "expanded", "immersive"];

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
  mode,
  onModeChange,
  labels,
  lyricsFetchPanel,
  aiPanel
}: LyricsToolsAsideProps) {
  const aiCopy = getAIUiCopy(locale);

  return (
    <aside
      className="lyrics-tools-aside app-text-muted h-full min-h-0 overflow-hidden rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-3"
      aria-label={labels.tools}
    >
      <div className="lyrics-tools-aside__body flex h-full min-h-0 flex-col gap-4">
        <section className="lyrics-tools-aside__modes grid shrink-0 gap-2" aria-labelledby="lyrics-viewport-mode-title">
          <div>
            <p id="lyrics-viewport-mode-title" className="app-text-primary text-sm font-semibold">
              {labels.viewMode}
            </p>
            {mode === "immersive" ? (
              <p className="app-text-subtle mt-1 text-[11px] leading-relaxed">{labels.immersiveExitHint}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label={labels.viewMode}>
            {VIEWPORT_MODES.map((candidate) => {
              const selected = mode === candidate;
              return (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onModeChange(candidate)}
                  className={cn(
                    "control-focus min-h-9 min-w-0 rounded-md border px-1.5 text-[11px] font-semibold transition",
                    selected
                      ? "app-text-primary border-[var(--control-selected-border)] bg-[var(--control-selected-bg-strong)]"
                      : "app-text-muted border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] hover:bg-[rgb(var(--button-bg-hover))]"
                  )}
                >
                  <span className="block truncate">{labels[candidate]}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="shrink-0 border-t border-[rgb(var(--panel-border))]" />

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
