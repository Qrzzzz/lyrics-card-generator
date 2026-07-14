"use client";

import {
  type ChangeEvent,
  type FocusEvent,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Music2 } from "lucide-react";
import { LyricsToolsAside, type LyricsToolsLabels } from "@/components/editor/LyricsToolsAside";
import {
  type LyricsEditorKey,
  useLyricsViewportSession
} from "@/components/editor/hooks/useLyricsViewportSession";
import { Section } from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { ExportLyricLineStatus } from "@/lib/lyrics-document";
import type { ContentMode, Locale, SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

type WorkspaceCopy = LyricsToolsLabels & {
  summary: string;
  manuscript: string;
  original: string;
  translation: string;
  paragraphs: string;
  currentPosition: string;
  sharedScrollHint: string;
};

type LyricsWorkspaceProps = {
  lyrics: string;
  song: SongInfo;
  lineStatus: ExportLyricLineStatus;
  onLyricsChange: (lyrics: string) => void;
  translationEnabled: boolean;
  translationText: string;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translation: string) => void;
  onSplitAlternatingLyrics: (lyrics: string, translationText: string) => void;
  onAITranslate: () => void;
  isAITranslating: boolean;
  aiPanel?: ReactNode;
  lyricsFetchPanel?: ReactNode;
  themeColor: string;
  contentMode: ContentMode;
  locale: Locale;
  t: ReturnType<typeof createT>;
  showAiTranslate?: boolean;
};

type ActiveEditor = LyricsEditorKey;

type CursorPosition = {
  editor: ActiveEditor;
  line: number;
  totalLines: number;
};

const WORKSPACE_COPY: Record<Locale, WorkspaceCopy> = {
  zh: {
    summary: "长稿摘要",
    manuscript: "歌词文档",
    original: "原文",
    translation: "译文",
    paragraphs: "{count} 段",
    currentPosition: "{label} · 第 {line} / {total} 行",
    sharedScrollHint: "原文与译文共享同一个滚动位置",
    tools: "编辑工具"
  },
  "zh-TW": {
    summary: "長稿摘要",
    manuscript: "歌詞文件",
    original: "原文",
    translation: "譯文",
    paragraphs: "{count} 段",
    currentPosition: "{label} · 第 {line} / {total} 行",
    sharedScrollHint: "原文與譯文共用同一個捲動位置",
    tools: "編輯工具"
  },
  en: {
    summary: "Manuscript summary",
    manuscript: "Lyrics document",
    original: "Original",
    translation: "Translation",
    paragraphs: "{count} sections",
    currentPosition: "{label} · line {line} / {total}",
    sharedScrollHint: "Original and translation share one scroll position",
    tools: "Editing tools"
  },
  fr: {
    summary: "Résumé du texte",
    manuscript: "Document de paroles",
    original: "Original",
    translation: "Traduction",
    paragraphs: "{count} sections",
    currentPosition: "{label} · ligne {line} / {total}",
    sharedScrollHint: "L’original et la traduction partagent le même défilement",
    tools: "Outils d’édition"
  },
  ja: {
    summary: "原稿の概要",
    manuscript: "歌詞ドキュメント",
    original: "原文",
    translation: "翻訳",
    paragraphs: "{count} セクション",
    currentPosition: "{label} · {line} / {total} 行",
    sharedScrollHint: "原文と翻訳は同じスクロール位置を共有します",
    tools: "編集ツール"
  },
  es: {
    summary: "Resumen del texto",
    manuscript: "Documento de letras",
    original: "Original",
    translation: "Traducción",
    paragraphs: "{count} secciones",
    currentPosition: "{label} · línea {line} / {total}",
    sharedScrollHint: "El original y la traducción comparten una sola posición de desplazamiento",
    tools: "Herramientas de edición"
  }
};

export function LyricsWorkspace({
  lyrics,
  song,
  lineStatus,
  onLyricsChange,
  translationEnabled,
  translationText,
  onTranslationEnabledChange,
  onTranslationTextChange,
  onSplitAlternatingLyrics,
  onAITranslate,
  isAITranslating,
  aiPanel,
  lyricsFetchPanel,
  themeColor,
  contentMode,
  locale,
  t,
  showAiTranslate = true
}: LyricsWorkspaceProps) {
  const copy = WORKSPACE_COPY[locale];
  const workspaceRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const translationRef = useRef<HTMLTextAreaElement>(null);
  const activeEditorRef = useRef<ActiveEditor>("lyrics");
  const lyricsId = useId();
  const translationId = useId();
  const showTranslation = contentMode === "lyrics" && translationEnabled;
  const lyricsStats = useMemo(() => getTextStats(lyrics), [lyrics]);
  const translationStats = useMemo(() => getTextStats(translationText), [translationText]);
  const [cursor, setCursor] = useState<CursorPosition>({
    editor: "lyrics",
    line: 1,
    totalLines: Math.max(1, lyricsStats.lines)
  });
  const getActiveEditorKey = useCallback(() => activeEditorRef.current, []);
  const getEditor = useCallback((editor: LyricsEditorKey) => (
    editor === "translation" ? translationRef.current : lyricsRef.current
  ), []);
  const viewport = useLyricsViewportSession({
    workspaceRef,
    scrollRef,
    getActiveEditorKey,
    getEditor
  });

  const resizeEditors = useCallback(() => {
    const editors = [lyricsRef.current, showTranslation ? translationRef.current : null].filter(Boolean) as HTMLTextAreaElement[];
    if (editors.length === 0) {
      return;
    }

    for (const editor of editors) {
      editor.style.height = "auto";
    }
    const viewportFloor = Math.max(280, (scrollRef.current?.clientHeight ?? 0) - 24);
    const commonHeight = Math.max(viewportFloor, ...editors.map((editor) => editor.scrollHeight));
    for (const editor of editors) {
      editor.style.height = `${commonHeight}px`;
    }
  }, [showTranslation]);

  useLayoutEffect(() => {
    viewport.restoreAnchor();
    resizeEditors();
  }, [lyrics, resizeEditors, translationText, viewport.restoreAnchor, viewport.viewportHeight]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      viewport.restoreAnchor();
      resizeEditors();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [resizeEditors, viewport.captureAnchor, viewport.restoreAnchor]);

  function updateCursor(event: SyntheticEvent<HTMLTextAreaElement>, editor: ActiveEditor) {
    const node = event.currentTarget;
    activeEditorRef.current = editor;
    viewport.captureAnchor(editor);
    const value = node.value;
    const line = value.slice(0, node.selectionStart ?? 0).split(/\r?\n/).length;
    setCursor({ editor, line, totalLines: Math.max(1, value.split(/\r?\n/).length) });
  }

  function onEditorFocus(event: FocusEvent<HTMLTextAreaElement>, editor: ActiveEditor) {
    updateCursor(event, editor);
  }

  function onLyricsEditorChange(event: ChangeEvent<HTMLTextAreaElement>) {
    activeEditorRef.current = "lyrics";
    viewport.captureAnchor("lyrics");
    updateCursor(event, "lyrics");
    onLyricsChange(event.currentTarget.value);
  }

  function onTranslationEditorChange(event: ChangeEvent<HTMLTextAreaElement>) {
    activeEditorRef.current = "translation";
    viewport.captureAnchor("translation");
    updateCursor(event, "translation");
    onTranslationTextChange(event.currentTarget.value);
  }

  if (contentMode !== "lyrics") {
    return (
      <Section title={t("lyrics")}>
        <p className="app-text-subtle text-sm">{t("instrumentalMode")}</p>
      </Section>
    );
  }

  const currentLabel = cursor.editor === "translation" ? copy.translation : copy.original;
  const currentTotalLines = Math.max(
    1,
    cursor.editor === "translation" ? translationStats.lines : lyricsStats.lines
  );
  const currentPosition = interpolate(copy.currentPosition, {
    label: currentLabel,
    line: String(Math.min(cursor.line, currentTotalLines)),
    total: String(currentTotalLines)
  });

  return (
    <div
      ref={workspaceRef}
      className="relative flex min-h-0 flex-col overflow-hidden"
      style={{ height: viewport.viewportHeight }}
      data-lyrics-viewport-mode="immersive"
      data-testid="lyrics-workspace"
    >
        <div className="lyrics-workspace-grid min-h-0 flex-1">
          <aside
            className="lyrics-workspace-column lyrics-summary-aside app-text-muted p-3"
            aria-label={copy.summary}
          >
            <div className="lyrics-summary-header flex items-center justify-between gap-3 md:block">
              <div>
                <p className="app-text-primary text-sm font-semibold">{copy.summary}</p>
                <p className="lyrics-summary-description app-text-subtle mt-1 text-[11px] leading-relaxed">{copy.manuscript}</p>
              </div>
              <span className="lyrics-summary-position app-text-subtle rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] px-2 py-1 text-[11px] md:mt-3 md:inline-block">
                {currentPosition}
              </span>
            </div>
            <div className="lyrics-song-summary mt-3 flex min-w-0 items-center gap-2.5 rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] p-2.5">
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
            <dl className="lyrics-summary-metrics mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-1">
              <SummaryMetric
                label={copy.original}
                value={t("lineCount", { lines: lyricsStats.lines, chars: lyricsStats.characters })}
                detail={interpolate(copy.paragraphs, { count: String(lyricsStats.paragraphs) })}
              />
              {showTranslation ? (
                <SummaryMetric
                  label={copy.translation}
                  value={t("lineCount", { lines: translationStats.lines, chars: translationStats.characters })}
                  detail={interpolate(copy.paragraphs, { count: String(translationStats.paragraphs) })}
                />
              ) : null}
            </dl>
            <div
              className={cn(
                "lyrics-line-budget mt-3 rounded-md border px-2.5 py-2 text-xs leading-relaxed",
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
          </aside>

          <section className="lyrics-workspace-column lyrics-document-column flex min-h-0 min-w-0 flex-col overflow-hidden bg-[rgb(var(--input-bg))]" aria-labelledby="lyrics-document-title">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[rgb(var(--panel-border))] px-3 py-2.5">
              <div className="min-w-0">
                <h3 id="lyrics-document-title" className="app-text-primary truncate text-sm font-semibold">
                  {copy.manuscript}
                </h3>
                <p className="app-text-subtle mt-0.5 truncate text-[11px]">{copy.sharedScrollHint}</p>
              </div>
              <span className="app-text-subtle shrink-0 font-mono text-[11px]">{currentPosition}</span>
            </header>
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
              data-testid="lyrics-shared-scroll"
            >
              <div
                className={cn(
                  "grid min-h-full items-start gap-3 p-3",
                  showTranslation ? "grid-cols-2" : "mx-auto w-full max-w-[52rem] grid-cols-1"
                )}
              >
                <EditorColumn label={copy.original} htmlFor={lyricsId} hint={t("lineCount", { lines: lyricsStats.lines, chars: lyricsStats.characters })}>
                  <textarea
                    ref={lyricsRef}
                    id={lyricsId}
                    value={lyrics}
                    onChange={onLyricsEditorChange}
                    onFocus={(event) => onEditorFocus(event, "lyrics")}
                    onSelect={(event) => updateCursor(event, "lyrics")}
                    onKeyUp={(event) => updateCursor(event, "lyrics")}
                    onClick={(event) => updateCursor(event, "lyrics")}
                    placeholder={t("lyricPlaceholder")}
                    className="field-shell control-focus block min-h-[280px] w-full resize-none overflow-hidden rounded-lg px-3 py-3 text-sm leading-[1.75]"
                  />
                </EditorColumn>
                {showTranslation ? (
                  <EditorColumn
                    label={copy.translation}
                    htmlFor={translationId}
                    hint={t("lineCount", { lines: translationStats.lines, chars: translationStats.characters })}
                  >
                    <div
                      className="rounded-[10px] p-px"
                      style={{ background: `color-mix(in srgb, ${themeColor} 36%, rgb(var(--input-border)))` }}
                    >
                      <textarea
                        ref={translationRef}
                        id={translationId}
                        value={translationText}
                        onChange={onTranslationEditorChange}
                        onFocus={(event) => onEditorFocus(event, "translation")}
                        onSelect={(event) => updateCursor(event, "translation")}
                        onKeyUp={(event) => updateCursor(event, "translation")}
                        onClick={(event) => updateCursor(event, "translation")}
                        placeholder={t("translationPlaceholder")}
                        className="field-shell control-focus block min-h-[280px] w-full resize-none overflow-hidden rounded-[9px] border-transparent px-3 py-3 text-sm leading-[1.75]"
                      />
                    </div>
                  </EditorColumn>
                ) : null}
              </div>
            </div>
          </section>

          <LyricsToolsAside
            lyrics={lyrics}
            translationEnabled={translationEnabled}
            translationText={translationText}
            onTranslationEnabledChange={(enabled) => {
              viewport.captureAnchor();
              onTranslationEnabledChange(enabled);
            }}
            onTranslationTextChange={(translation) => {
              viewport.captureAnchor("translation");
              onTranslationTextChange(translation);
            }}
            onSplitAlternatingLyrics={(nextLyrics, nextTranslation) => {
              viewport.captureAnchor("lyrics");
              onSplitAlternatingLyrics(nextLyrics, nextTranslation);
            }}
            onAITranslate={onAITranslate}
            isAITranslating={isAITranslating}
            showAiTranslate={showAiTranslate}
            themeColor={themeColor}
            locale={locale}
            t={t}
            labels={copy}
            lyricsFetchPanel={lyricsFetchPanel}
            aiPanel={aiPanel}
          />
        </div>

    </div>
  );
}

function EditorColumn({
  label,
  hint,
  htmlFor,
  children
}: {
  label: string;
  hint: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-2 bg-[rgb(var(--input-bg))] py-1">
        <label htmlFor={htmlFor} className="app-text-primary text-xs font-semibold">
          {label}
        </label>
        <span className="app-text-subtle truncate text-[10px]">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="lyrics-summary-metric rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] p-2.5">
      <dt className="app-text-primary font-semibold">{label}</dt>
      <dd className="app-text-subtle mt-1 leading-relaxed">{value}</dd>
      <dd className="lyrics-summary-metric__detail app-text-subtle mt-0.5">{detail}</dd>
    </div>
  );
}

function getTextStats(text: string) {
  const lines = text ? text.split(/\r?\n/).length : 0;
  const paragraphs = text.trim()
    ? text.trim().split(/(?:\r?\n){2,}/).filter((part) => part.trim().length > 0).length
    : 0;
  return { lines, characters: text.length, paragraphs };
}

function interpolate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
