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
import { LyricsToolsAside, type LyricsToolsLabels } from "@/components/editor/LyricsToolsAside";
import { useLyricsWorkspaceSplit } from "@/components/editor/hooks/useLyricsWorkspaceSplit";
import {
  type LyricsEditorKey,
  useLyricsViewportSession
} from "@/components/editor/hooks/useLyricsViewportSession";
import { Section } from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import type { ExportLyricLineStatus } from "@/lib/lyrics-document";
import {
  __internalLyricsWorkspaceLayout,
  type LyricsWorkspaceLayoutAction,
  type LyricsWorkspaceLayoutState
} from "@/lib/lyrics-workspace-layout";
import type { ContentMode, Locale, SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

type WorkspaceCopy = LyricsToolsLabels & {
  manuscript: string;
  currentPosition: string;
  sharedScrollHint: string;
  resizeTools: string;
};

type LyricsWorkspaceProps = {
  lyrics: string;
  song: SongInfo;
  lineStatus: ExportLyricLineStatus;
  layout: LyricsWorkspaceLayoutState;
  onLayoutAction: (action: LyricsWorkspaceLayoutAction) => void;
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
    tools: "编辑工具",
    collapseTools: "折叠编辑工具",
    expandTools: "展开编辑工具",
    resizeTools: "调整歌词编辑区和工具区宽度"
  },
  "zh-TW": {
    summary: "長稿摘要",
    manuscript: "歌詞文件",
    original: "原文",
    translation: "譯文",
    paragraphs: "{count} 段",
    currentPosition: "{label} · 第 {line} / {total} 行",
    sharedScrollHint: "原文與譯文共用同一個捲動位置",
    tools: "編輯工具",
    collapseTools: "收合編輯工具",
    expandTools: "展開編輯工具",
    resizeTools: "調整歌詞編輯區與工具區寬度"
  },
  en: {
    summary: "Manuscript summary",
    manuscript: "Lyrics document",
    original: "Original",
    translation: "Translation",
    paragraphs: "{count} sections",
    currentPosition: "{label} · line {line} / {total}",
    sharedScrollHint: "Original and translation share one scroll position",
    tools: "Editing tools",
    collapseTools: "Collapse editing tools",
    expandTools: "Expand editing tools",
    resizeTools: "Resize the lyrics editor and tools"
  },
  fr: {
    summary: "Résumé du texte",
    manuscript: "Document de paroles",
    original: "Original",
    translation: "Traduction",
    paragraphs: "{count} sections",
    currentPosition: "{label} · ligne {line} / {total}",
    sharedScrollHint: "L’original et la traduction partagent le même défilement",
    tools: "Outils d’édition",
    collapseTools: "Réduire les outils d’édition",
    expandTools: "Développer les outils d’édition",
    resizeTools: "Redimensionner l’éditeur de paroles et les outils"
  },
  ja: {
    summary: "原稿の概要",
    manuscript: "歌詞ドキュメント",
    original: "原文",
    translation: "翻訳",
    paragraphs: "{count} セクション",
    currentPosition: "{label} · {line} / {total} 行",
    sharedScrollHint: "原文と翻訳は同じスクロール位置を共有します",
    tools: "編集ツール",
    collapseTools: "編集ツールを折りたたむ",
    expandTools: "編集ツールを展開",
    resizeTools: "歌詞エディターとツールの幅を調整"
  },
  es: {
    summary: "Resumen del texto",
    manuscript: "Documento de letras",
    original: "Original",
    translation: "Traducción",
    paragraphs: "{count} secciones",
    currentPosition: "{label} · línea {line} / {total}",
    sharedScrollHint: "El original y la traducción comparten una sola posición de desplazamiento",
    tools: "Herramientas de edición",
    collapseTools: "Contraer las herramientas de edición",
    expandTools: "Expandir las herramientas de edición",
    resizeTools: "Cambiar el ancho del editor de letras y las herramientas"
  }
};

export function LyricsWorkspace({
  lyrics,
  song,
  lineStatus,
  layout,
  onLayoutAction,
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
  const split = useLyricsWorkspaceSplit({
    layout,
    onLayoutAction,
    onBeforeLayoutChange: viewport.captureAnchor
  });
  const sideBySide = split.isDesktop;
  const toolsCollapsed = sideBySide && layout.collapsed;

  const resizeEditors = useCallback(() => {
    const editors = [lyricsRef.current, showTranslation ? translationRef.current : null].filter(Boolean) as HTMLTextAreaElement[];
    if (editors.length === 0) {
      return;
    }

    for (const editor of editors) {
      editor.style.height = "auto";
    }
    const viewportFloor = Math.max(
      280,
      (scrollRef.current?.clientHeight ?? 0) - 24
    );
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
  const splitStyle = sideBySide
    ? toolsCollapsed
      ? {
          gridTemplateColumns: `minmax(0, 1fr) ${__internalLyricsWorkspaceLayout.COLLAPSED_TOOLS_WIDTH}px`,
          columnGap: __internalLyricsWorkspaceLayout.COLLAPSED_GAP
        }
      : {
          gridTemplateColumns: `${split.geometry.editorWidth}px ${split.geometry.toolsWidth}px`,
          columnGap: split.geometry.gap
        }
    : undefined;

  return (
    <div
      ref={workspaceRef}
      className="relative flex min-h-0 flex-col overflow-hidden"
      style={{ height: viewport.viewportHeight }}
      data-lyrics-viewport-mode="immersive"
      data-testid="lyrics-workspace"
    >
        <div
          ref={split.viewportRef}
          className="lyrics-workspace-split relative grid min-h-0 flex-1 min-w-0 overflow-hidden"
          style={splitStyle}
          data-side-by-side={sideBySide ? "true" : "false"}
          data-tools-collapsed={toolsCollapsed ? "true" : "false"}
          data-editor-ratio={split.geometry.ratio.toFixed(4)}
          data-testid="lyrics-workspace-split"
        >
          <section
            id="lyrics-workspace-editor"
            className="lyrics-document-column flex min-h-0 min-w-0 flex-col overflow-hidden bg-[rgb(var(--input-bg))]"
            aria-labelledby="lyrics-document-title"
          >
            <header
              className="lyrics-editor-status sticky top-0 z-20 flex min-w-0 items-center justify-between gap-3 border-b border-[rgb(var(--panel-border))] bg-[rgb(var(--input-bg))] px-3 py-1.5"
              data-testid="lyrics-editor-status"
            >
              <div className="flex min-w-0 items-center gap-2 overflow-hidden text-[11px]">
                <h3 id="lyrics-document-title" className="app-text-primary shrink-0 text-xs font-semibold">
                  {copy.manuscript}
                </h3>
                <span className="app-text-subtle" aria-hidden="true">·</span>
                <span className="app-text-subtle min-w-0 truncate">
                  <span className="font-semibold">{copy.original}</span>
                  <span className="ml-1">{t("lineCount", { lines: lyricsStats.lines, chars: lyricsStats.characters })}</span>
                </span>
                {showTranslation ? (
                  <>
                    <span className="app-text-subtle" aria-hidden="true">·</span>
                    <span className="app-text-subtle min-w-0 truncate">
                      <span className="font-semibold">{copy.translation}</span>
                      <span className="ml-1">{t("lineCount", { lines: translationStats.lines, chars: translationStats.characters })}</span>
                    </span>
                  </>
                ) : null}
                <span className="sr-only">{copy.sharedScrollHint}</span>
              </div>
              <span className="app-text-subtle shrink-0 font-mono text-[10px]">{currentPosition}</span>
            </header>
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
              data-testid="lyrics-shared-scroll"
            >
              <div
                className={cn(
                  "grid min-h-full min-w-0 items-start gap-3 p-3",
                  showTranslation ? "grid-cols-2" : "mx-auto w-full max-w-[52rem] grid-cols-1"
                )}
                data-testid="lyrics-editor-columns"
                data-bilingual={showTranslation ? "true" : "false"}
              >
                <EditorColumn label={copy.original} htmlFor={lyricsId}>
                  <textarea
                    ref={lyricsRef}
                    id={lyricsId}
                    value={lyrics}
                    onChange={onLyricsEditorChange}
                    onFocus={(event) => onEditorFocus(event, "lyrics")}
                    onSelect={(event) => updateCursor(event, "lyrics")}
                    onKeyUp={(event) => updateCursor(event, "lyrics")}
                    onClick={(event) => updateCursor(event, "lyrics")}
                    wrap="soft"
                    placeholder={t("lyricPlaceholder")}
                    className="field-shell control-focus block min-h-[280px] min-w-0 w-full resize-none overflow-x-hidden overflow-y-hidden rounded-lg px-3 py-3 text-sm leading-[1.75]"
                  />
                </EditorColumn>
                {showTranslation ? (
                  <EditorColumn
                    label={copy.translation}
                    htmlFor={translationId}
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
                        wrap="soft"
                        placeholder={t("translationPlaceholder")}
                        className="field-shell control-focus block min-h-[280px] min-w-0 w-full resize-none overflow-x-hidden overflow-y-hidden rounded-[9px] border-transparent px-3 py-3 text-sm leading-[1.75]"
                      />
                    </div>
                  </EditorColumn>
                ) : null}
              </div>
            </div>
          </section>

          <LyricsToolsAside
            lyrics={lyrics}
            song={song}
            lineStatus={lineStatus}
            lyricsStats={lyricsStats}
            translationStats={translationStats}
            showTranslation={showTranslation}
            collapsed={toolsCollapsed}
            collapsible={sideBySide}
            onToggleCollapsed={() => {
              viewport.captureAnchor();
              onLayoutAction({ type: "toggle" });
            }}
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
          {sideBySide && !layout.collapsed && split.geometry.viewportWidth > 0 ? (
            <div
              {...split.separatorProps}
              role="separator"
              aria-label={copy.resizeTools}
              aria-controls="lyrics-workspace-editor lyrics-workspace-tools"
              aria-orientation="vertical"
              aria-valuemin={Math.round(split.geometry.minRatio * 100)}
              aria-valuemax={Math.round(split.geometry.maxRatio * 100)}
              aria-valuenow={Math.round(split.geometry.ratio * 100)}
              aria-valuetext={`${Math.round(split.geometry.ratio * 100)}% / ${Math.round((1 - split.geometry.ratio) * 100)}%`}
              tabIndex={0}
              title={copy.resizeTools}
              className="preview-workbench-resizer lyrics-workspace-resizer"
              data-testid="lyrics-workspace-resizer"
              data-dragging={split.isDragging ? "true" : "false"}
              style={{
                left: split.geometry.editorWidth,
                width: split.geometry.gap
              }}
            />
          ) : null}
        </div>

    </div>
  );
}

function EditorColumn({
  label,
  htmlFor,
  children
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="sr-only">{label}</label>
      {children}
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
