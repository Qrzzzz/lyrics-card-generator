"use client";

import {
  Languages,
  Loader2,
  Music2,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  SplitSquareVertical
} from "lucide-react";
import type { ReactNode } from "react";
import { AiTranslateButton } from "@/components/lyrics/AiTranslateButton";
import { ActionButton, ToggleRow } from "@/components/ui/controls";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { createT } from "@/lib/i18n";
import { formatChineseTranslation, splitAlternatingLyrics } from "@/lib/lyric-format";
import type { ExportLyricLineStatus } from "@/lib/lyrics-document";
import type { Locale, SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export type LyricsTextStats = {
  lines: number;
  characters: number;
  paragraphs: number;
};

export type LyricsToolsLabels = {
  tools: string;
  summary: string;
  original: string;
  translation: string;
  paragraphs: string;
  collapseTools: string;
  expandTools: string;
};

type LyricsToolsAsideProps = {
  lyrics: string;
  song: SongInfo;
  lineStatus: ExportLyricLineStatus;
  lyricsStats: LyricsTextStats;
  translationStats: LyricsTextStats;
  showTranslation: boolean;
  collapsed: boolean;
  collapsible: boolean;
  onToggleCollapsed: () => void;
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
  song,
  lineStatus,
  lyricsStats,
  translationStats,
  showTranslation,
  collapsed,
  collapsible,
  onToggleCollapsed,
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
  const bodyId = "lyrics-tools-expanded-body";
  const hasDynamicPanel = Boolean(lyricsFetchPanel || aiPanel);

  function splitLyrics() {
    const result = splitAlternatingLyrics(lyrics, locale);
    onSplitAlternatingLyrics(result.lyrics, result.translationText);
  }

  return (
    <aside
      id="lyrics-workspace-tools"
      className={cn(
        "lyrics-tools-aside app-text-muted h-full min-h-0 min-w-0 overflow-hidden",
        collapsed ? "lyrics-tools-aside--collapsed p-2" : "p-3"
      )}
      aria-label={labels.tools}
      data-testid="lyrics-tools-aside"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className={cn("flex shrink-0 items-center", collapsed ? "justify-center" : "justify-between gap-3")}>
          {!collapsed ? (
            <p id="lyrics-tools-title" className="app-text-primary truncate text-sm font-semibold">
              {labels.tools}
            </p>
          ) : null}
          {collapsible ? (
            <button
              type="button"
              className="app-button control-focus flex size-10 shrink-0 items-center justify-center rounded-lg"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? labels.expandTools : labels.collapseTools}
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              title={collapsed ? labels.expandTools : labels.collapseTools}
              data-testid="lyrics-tools-collapse"
            >
              {collapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
            </button>
          ) : null}
        </div>

        {collapsed ? (
          <div className="mt-2 flex min-h-0 flex-1 flex-col items-center gap-2" aria-labelledby="lyrics-tools-title">
            {showAiTranslate ? (
              <CollapsedToolButton
                label={isAITranslating ? aiCopy.translating : aiCopy.aiTranslate}
                onClick={onAITranslate}
                disabled={isAITranslating}
                icon={isAITranslating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                testId="lyrics-tool-ai-collapsed"
              />
            ) : null}
            <button
              type="button"
              role="switch"
              aria-checked={translationEnabled}
              aria-label={t("enableTranslation")}
              title={t("enableTranslation")}
              onClick={() => onTranslationEnabledChange(!translationEnabled)}
              className={cn(
                "app-button control-focus relative flex size-10 items-center justify-center rounded-lg",
                translationEnabled && "border-[var(--control-selected-border)] bg-[rgb(var(--button-bg-hover))]"
              )}
              data-testid="translation-toggle"
            >
              <Languages className="size-4" />
              <span
                className={cn(
                  "absolute bottom-1.5 right-1.5 size-1.5 rounded-full",
                  translationEnabled ? "bg-[var(--control-focus-border)]" : "bg-[rgb(var(--muted-fg))]"
                )}
                aria-hidden="true"
              />
            </button>
            <CollapsedToolButton
              label={t("splitAlternatingLyrics")}
              onClick={splitLyrics}
              icon={<SplitSquareVertical className="size-4" />}
              testId="lyrics-tool-split-collapsed"
            />
            <div
              className={cn(
                "mt-auto w-full rounded-md border px-1 py-2 text-center font-mono text-[10px] font-semibold leading-none",
                lineStatus.isOverLimit ? "status-danger" : "status-idle"
              )}
              role={lineStatus.isOverLimit ? "alert" : "status"}
              aria-label={t("lyricsLineLimitSummary", {
                original: lineStatus.originalLineCount,
                translation: lineStatus.translationLineCount,
                total: lineStatus.totalLineCount,
                max: lineStatus.maxLineCount
              })}
              data-testid="lyrics-line-budget"
            >
              {lineStatus.totalLineCount}/{lineStatus.maxLineCount}
            </div>
          </div>
        ) : (
          <div id={bodyId} className="lyrics-tools-aside__body mt-3 flex min-h-0 flex-1 flex-col gap-3">
            <section className="lyrics-tools-aside__actions grid shrink-0 gap-2" aria-labelledby="lyrics-tools-title">
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
                onClick={splitLyrics}
                className="lyrics-tool-split w-full justify-start"
                title={t("splitAlternatingLyrics")}
              >
                {t("splitAlternatingLyrics")}
              </ActionButton>
            </section>

            <section className="grid shrink-0 gap-2" aria-label={t("enableTranslation")}>
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

            <LineBudget lineStatus={lineStatus} t={t} />

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
            {!hasDynamicPanel ? (
              <LyricsSummary
                song={song}
                lyricsStats={lyricsStats}
                translationStats={translationStats}
                showTranslation={showTranslation}
                labels={labels}
                t={t}
              />
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}

function CollapsedToolButton({
  label,
  icon,
  onClick,
  disabled = false,
  testId
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="app-button control-focus flex size-10 items-center justify-center rounded-lg disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={testId}
    >
      {icon}
    </button>
  );
}

function LineBudget({
  lineStatus,
  t
}: {
  lineStatus: ExportLyricLineStatus;
  t: ReturnType<typeof createT>;
}) {
  return (
    <div
      className={cn(
        "lyrics-line-budget shrink-0 rounded-md border px-2.5 py-2 text-xs leading-relaxed",
        lineStatus.isOverLimit ? "status-danger" : "status-idle"
      )}
      role={lineStatus.isOverLimit ? "alert" : "status"}
      data-testid="lyrics-line-budget"
    >
      <p className="font-semibold">
        {t("lyricsLineLimitSummary", {
          original: lineStatus.originalLineCount,
          translation: lineStatus.translationLineCount,
          total: lineStatus.totalLineCount,
          max: lineStatus.maxLineCount
        })}
      </p>
      {lineStatus.isOverLimit ? (
        <p className="lyrics-line-budget__error mt-1">
          {t("lyricsLineLimitExceeded", {
            total: lineStatus.totalLineCount,
            max: lineStatus.maxLineCount
          })}
        </p>
      ) : null}
    </div>
  );
}

function LyricsSummary({
  song,
  lyricsStats,
  translationStats,
  showTranslation,
  labels,
  t
}: {
  song: SongInfo;
  lyricsStats: LyricsTextStats;
  translationStats: LyricsTextStats;
  showTranslation: boolean;
  labels: LyricsToolsLabels;
  t: ReturnType<typeof createT>;
}) {
  return (
    <section className="lyrics-tools-summary min-h-0 overflow-y-auto overscroll-contain" aria-label={labels.summary}>
      <div className="lyrics-song-summary flex min-w-0 items-center gap-2.5 rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] p-2.5">
        <div className="lyrics-song-summary__cover control-surface relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md">
          {song.coverUrl || song.proxiedCoverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={song.proxiedCoverUrl || proxiedImageUrl(song.coverUrl)}
              alt=""
              className="absolute inset-0 size-full object-cover"
              crossOrigin="anonymous"
            />
          ) : (
            <Music2 className="app-text-subtle size-4" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <p className="app-text-primary truncate text-xs font-semibold">{song.title || t("untitled")}</p>
          <p className="app-text-subtle mt-0.5 truncate text-[10px]">{song.artist || t("unknownArtist")}</p>
        </div>
      </div>
      <dl className="lyrics-summary-metrics mt-2 grid gap-2 text-xs">
        <SummaryMetric label={labels.original} stats={lyricsStats} labels={labels} t={t} />
        {showTranslation ? (
          <SummaryMetric label={labels.translation} stats={translationStats} labels={labels} t={t} />
        ) : null}
      </dl>
    </section>
  );
}

function SummaryMetric({
  label,
  stats,
  labels,
  t
}: {
  label: string;
  stats: LyricsTextStats;
  labels: LyricsToolsLabels;
  t: ReturnType<typeof createT>;
}) {
  return (
    <div className="lyrics-summary-metric rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] p-2.5">
      <dt className="app-text-primary font-semibold">{label}</dt>
      <dd className="app-text-subtle mt-1 leading-relaxed">{t("lineCount", { lines: stats.lines, chars: stats.characters })}</dd>
      <dd className="lyrics-summary-metric__detail app-text-subtle mt-0.5">
        {interpolate(labels.paragraphs, { count: String(stats.paragraphs) })}
      </dd>
    </div>
  );
}

function interpolate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
