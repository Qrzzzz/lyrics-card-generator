"use client";

import { motion, type Transition } from "framer-motion";
import {
  type ChangeEvent,
  type FocusEvent,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  LyricsCommandBar,
  LyricsStatusBar,
  type LyricsCommandIntent
} from "@/components/editor/LyricsCommandBar";
import { LyricsReviewMenu } from "@/components/editor/LyricsReviewMenu";
import { LyricsSidebar } from "@/components/editor/LyricsSidebar";
import {
  formatLyricsWorkspaceCopy,
  getLyricsWorkspaceCopy
} from "@/components/editor/lyrics-workspace-copy";
import { useLyricsWorkspaceSplit } from "@/components/editor/hooks/useLyricsWorkspaceSplit";
import {
  type LyricsEditorKey,
  useLyricsViewportSession
} from "@/components/editor/hooks/useLyricsViewportSession";
import { Section } from "@/components/ui/controls";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import type { createT } from "@/lib/i18n";
import type { ExportLyricLineStatus } from "@/lib/lyrics-document";
import {
  __internalLyricsWorkspaceLayout,
  type LyricsWorkspaceLayoutAction,
  type LyricsWorkspaceLayoutState
} from "@/lib/lyrics-workspace-layout";
import {
  analyzeLyricsDocument,
  cleanPastedLyrics,
  cleanSynchronizedBlankRows,
  collapseConsecutiveBlankLines,
  createLyricsOperationHistory,
  getLyricsLineSelection,
  mergeSelectedLyricsLines,
  recordLyricsOperation,
  redoLyricsOperation,
  removeAllBlankLines,
  removeParagraphTags,
  resolveLyricsTextScope,
  snapshotsEqual,
  stripLrcTimeline,
  swapLyricsColumns,
  trimBoundaryBlankLines,
  undoLyricsOperation,
  type LyricsBlankMode,
  type LyricsDocumentSnapshot,
  type LyricsHistoryEntry,
  type LyricsScopedTransform,
  type LyricsSelectionSnapshot,
  type LyricsSidebarTab,
  type LyricsTextSelection,
  type LyricsWorkbenchEditor
} from "@/lib/lyrics-workbench";
import { reducedMotionTransition } from "@/lib/motion/tokens";
import type { ContentMode, Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

type LyricsWorkspaceProps = {
  lyrics: string;
  lineStatus: ExportLyricLineStatus;
  layout: LyricsWorkspaceLayoutState;
  sidebarTab: LyricsSidebarTab;
  onSidebarTabChange: (tab: LyricsSidebarTab) => void;
  onLayoutAction: (action: LyricsWorkspaceLayoutAction) => void;
  onLyricsChange: (lyrics: string) => void;
  translationEnabled: boolean;
  translationText: string;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translation: string) => void;
  onLyricsDocumentChange: (snapshot: LyricsDocumentSnapshot) => void;
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

type CursorPosition = {
  editor: LyricsWorkbenchEditor;
  line: number;
  totalLines: number;
};

type OperationFeedback = {
  message: string;
  canUndo: boolean;
};

export function LyricsWorkspace({
  lyrics,
  lineStatus,
  layout,
  sidebarTab,
  onSidebarTabChange,
  onLayoutAction,
  onLyricsChange,
  translationEnabled,
  translationText,
  onTranslationEnabledChange,
  onTranslationTextChange,
  onLyricsDocumentChange,
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
  const copy = getLyricsWorkspaceCopy(locale);
  const reduceMotion = useAppReducedMotion();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const translationRef = useRef<HTMLTextAreaElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const previousSidebarCollapsedRef = useRef(layout.collapsed);
  const activeEditorRef = useRef<LyricsWorkbenchEditor>("lyrics");
  const lyricsId = useId();
  const translationId = useId();
  const showTranslation = contentMode === "lyrics" && translationEnabled;
  const lyricsStats = useMemo(() => getTextStats(lyrics), [lyrics]);
  const translationStats = useMemo(() => getTextStats(translationText), [translationText]);
  const documentSnapshot = useMemo<LyricsDocumentSnapshot>(() => ({
    lyrics,
    translationText,
    translationEnabled
  }), [lyrics, translationEnabled, translationText]);
  const [cursor, setCursor] = useState<CursorPosition>({
    editor: "lyrics",
    line: 1,
    totalLines: Math.max(1, lyricsStats.lines)
  });
  const [selections, setSelections] = useState<Record<LyricsWorkbenchEditor, LyricsTextSelection>>({
    lyrics: { start: 0, end: 0 },
    translation: { start: 0, end: 0 }
  });
  const selectionsRef = useRef(selections);
  selectionsRef.current = selections;
  const [feedback, setFeedback] = useState<OperationFeedback | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [focusIntent, setFocusIntent] = useState<LyricsCommandIntent | null>(null);
  const historyRef = useRef(createLyricsOperationHistory());
  const expectedSnapshotRef = useRef<LyricsDocumentSnapshot | null>(null);
  const previousSnapshotRef = useRef(documentSnapshot);
  const pendingSelectionRef = useRef<LyricsSelectionSnapshot | null>(null);
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
  const sidebarCollapsed = sideBySide && layout.collapsed;
  const sidebarExpanded = sideBySide ? !layout.collapsed : mobileSidebarOpen;
  const animateSidebarDisclosure = sideBySide && previousSidebarCollapsedRef.current !== layout.collapsed;
  const activeText = cursor.editor === "translation" ? translationText : lyrics;
  const activeSelection = clampSelection(selections[cursor.editor], activeText.length);
  const activeScope = resolveLyricsTextScope(activeText, activeSelection);
  const analysis = useMemo(() => analyzeLyricsDocument({
    lyrics,
    translationText,
    translationEnabled: showTranslation
  }), [lyrics, showTranslation, translationText]);

  useEffect(() => {
    previousSidebarCollapsedRef.current = layout.collapsed;
  }, [layout.collapsed]);
  const resizeEditors = useCallback(() => {
    const editors = [lyricsRef.current, showTranslation ? translationRef.current : null].filter(Boolean) as HTMLTextAreaElement[];
    if (editors.length === 0) return;
    for (const editor of editors) editor.style.height = "auto";
    const viewportFloor = Math.max(280, (scrollRef.current?.clientHeight ?? 0) - 24);
    const commonHeight = Math.max(viewportFloor, ...editors.map((editor) => editor.scrollHeight));
    for (const editor of editors) editor.style.height = `${commonHeight}px`;
  }, [showTranslation]);

  useLayoutEffect(() => {
    viewport.restoreAnchor();
    resizeEditors();
  }, [lyrics, resizeEditors, translationText, viewport.restoreAnchor, viewport.viewportHeight]);

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) return;
    const editor = getEditor(pending.editor);
    if (!editor) return;
    const selection = clampSelection(pending, editor.value.length);
    editor.setSelectionRange(selection.start, selection.end);
    editor.focus({ preventScroll: true });
    activeEditorRef.current = pending.editor;
    const nextCursor = cursorForSelection(pending.editor, editor.value, selection.start);
    setSelections((current) => ({ ...current, [pending.editor]: selection }));
    setCursor(nextCursor);
    pendingSelectionRef.current = null;
    viewport.restoreAnchor();
  }, [getEditor, lyrics, translationEnabled, translationText, viewport.restoreAnchor]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      viewport.restoreAnchor();
      resizeEditors();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [resizeEditors, viewport.restoreAnchor]);

  useEffect(() => {
    const previous = previousSnapshotRef.current;
    previousSnapshotRef.current = documentSnapshot;
    if (snapshotsEqual(previous, documentSnapshot)) return;
    if (expectedSnapshotRef.current && snapshotsEqual(expectedSnapshotRef.current, documentSnapshot)) {
      expectedSnapshotRef.current = null;
      return;
    }
    historyRef.current = createLyricsOperationHistory();
    setHistoryRevision((value) => value + 1);
    setFeedback(null);
  }, [documentSnapshot]);

  function clearOperationHistory() {
    if (historyRef.current.past.length === 0 && historyRef.current.future.length === 0 && !feedback) return;
    historyRef.current = createLyricsOperationHistory();
    setHistoryRevision((value) => value + 1);
    setFeedback(null);
  }

  function updateCursor(event: SyntheticEvent<HTMLTextAreaElement>, editor: LyricsWorkbenchEditor) {
    const node = event.currentTarget;
    activeEditorRef.current = editor;
    viewport.captureAnchor(editor);
    const selection = {
      start: node.selectionStart ?? 0,
      end: node.selectionEnd ?? node.selectionStart ?? 0
    };
    setSelections((current) => ({ ...current, [editor]: selection }));
    setCursor(cursorForSelection(editor, node.value, selection.start));
  }

  function onEditorFocus(event: FocusEvent<HTMLTextAreaElement>, editor: LyricsWorkbenchEditor) {
    updateCursor(event, editor);
  }

  function onLyricsEditorChange(event: ChangeEvent<HTMLTextAreaElement>) {
    clearOperationHistory();
    activeEditorRef.current = "lyrics";
    viewport.captureAnchor("lyrics");
    updateCursor(event, "lyrics");
    onLyricsChange(event.currentTarget.value);
  }

  function onTranslationEditorChange(event: ChangeEvent<HTMLTextAreaElement>) {
    clearOperationHistory();
    activeEditorRef.current = "translation";
    viewport.captureAnchor("translation");
    updateCursor(event, "translation");
    onTranslationTextChange(event.currentTarget.value);
  }

  function captureCurrentSelection(editor = activeEditorRef.current): LyricsSelectionSnapshot {
    const node = getEditor(editor);
    const valueLength = editor === "translation" ? translationText.length : lyrics.length;
    const selection = node
      ? { start: node.selectionStart ?? 0, end: node.selectionEnd ?? node.selectionStart ?? 0 }
      : selectionsRef.current[editor];
    return { editor, ...clampSelection(selection, valueLength) };
  }

  function commitOperation(params: {
    label: string;
    next: LyricsDocumentSnapshot;
    afterSelection: LyricsSelectionSnapshot;
    message: string;
  }) {
    if (snapshotsEqual(documentSnapshot, params.next)) {
      setFeedback({ message: copy.noChanges, canUndo: false });
      return false;
    }
    viewport.captureAnchor(params.afterSelection.editor);
    const entry: LyricsHistoryEntry = {
      label: params.label,
      before: documentSnapshot,
      after: params.next,
      beforeSelection: captureCurrentSelection(),
      afterSelection: params.afterSelection
    };
    historyRef.current = recordLyricsOperation(historyRef.current, entry);
    expectedSnapshotRef.current = params.next;
    pendingSelectionRef.current = params.afterSelection;
    setHistoryRevision((value) => value + 1);
    setFeedback({ message: params.message, canUndo: true });
    onLyricsDocumentChange(params.next);
    return true;
  }

  function applyActiveTransform(
    label: string,
    result: LyricsScopedTransform,
    message: string
  ) {
    if (!result.changed) {
      setFeedback({ message: copy.noChanges, canUndo: false });
      return;
    }
    const editor = activeEditorRef.current;
    commitOperation({
      label,
      next: editor === "translation"
        ? { ...documentSnapshot, translationText: result.text, translationEnabled: true }
        : { ...documentSnapshot, lyrics: result.text },
      afterSelection: { editor, ...result.selection },
      message
    });
  }

  function blankCleanup(mode: LyricsBlankMode, synchronized: boolean) {
    const label = mode === "trim"
      ? copy.trimBlankLines
      : mode === "collapse"
        ? copy.collapseBlankLines
        : copy.removeBlankLines;
    if (synchronized && showTranslation) {
      const result = cleanSynchronizedBlankRows({
        lyrics,
        translationText,
        mode,
        lineRange: activeScope.hasSelection
          ? { startLine: activeScope.startLine, endLine: activeScope.endLine }
          : undefined
      });
      if (!result.changed) {
        setFeedback({ message: copy.noChanges, canUndo: false });
        return;
      }
      const selection = captureCurrentSelection();
      commitOperation({
        label,
        next: {
          lyrics: result.lyrics,
          translationText: result.translationText,
          translationEnabled: true
        },
        afterSelection: {
          ...selection,
          start: Math.min(selection.start, selection.editor === "lyrics" ? result.lyrics.length : result.translationText.length),
          end: Math.min(selection.end, selection.editor === "lyrics" ? result.lyrics.length : result.translationText.length)
        },
        message: formatLyricsWorkspaceCopy(copy.synchronizedResult, { count: result.removedRows })
      });
      return;
    }

    const transform = mode === "trim"
      ? trimBoundaryBlankLines
      : mode === "collapse"
        ? collapseConsecutiveBlankLines
        : removeAllBlankLines;
    const result = transform(activeText, activeSelection);
    applyActiveTransform(
      label,
      result,
      formatLyricsWorkspaceCopy(copy.removedLinesResult, {
        scope: scopeLabel,
        count: result.stats.removedLines ?? 0
      })
    );
  }

  function cleanPaste() {
    const result = cleanPastedLyrics(activeText, activeSelection);
    const count = (result.stats.trailingWhitespaceLines ?? 0) +
      (result.stats.whitespaceOnlyLines ?? 0) +
      (result.stats.invisibleCharacters ?? 0) +
      (result.stats.newlineChanges ?? 0);
    applyActiveTransform(
      copy.cleanPaste,
      result,
      formatLyricsWorkspaceCopy(copy.cleanedPasteResult, { count })
    );
  }

  function cleanLrc() {
    const result = stripLrcTimeline(activeText, activeSelection);
    applyActiveTransform(
      copy.lrcHeading,
      result,
      formatLyricsWorkspaceCopy(copy.cleanedLrcResult, {
        timestamps: result.stats.timestamps ?? 0,
        metadata: result.stats.metadata ?? 0
      })
    );
  }

  function mergeLines() {
    const result = mergeSelectedLyricsLines(activeText, activeSelection);
    applyActiveTransform(
      copy.mergeHeading,
      result,
      formatLyricsWorkspaceCopy(copy.mergedResult, {
        count: (result.stats.mergedLines ?? 0) + 1
      })
    );
  }

  function cleanParagraphTags() {
    const result = removeParagraphTags(activeText, activeSelection);
    applyActiveTransform(
      copy.tagsHeading,
      result,
      formatLyricsWorkspaceCopy(copy.tagsRemovedResult, {
        scope: scopeLabel,
        count: result.stats.tags?.length ?? 0
      })
    );
  }

  function formatTranslation(nextTranslation: string) {
    const selection = captureCurrentSelection("translation");
    commitOperation({
      label: copy.formatTranslation,
      next: { ...documentSnapshot, translationText: nextTranslation, translationEnabled: true },
      afterSelection: {
        ...selection,
        start: Math.min(selection.start, nextTranslation.length),
        end: Math.min(selection.end, nextTranslation.length)
      },
      message: copy.formattedResult
    });
  }

  function splitAlternating(nextLyrics: string, nextTranslation: string) {
    commitOperation({
      label: copy.splitApply,
      next: { lyrics: nextLyrics, translationText: nextTranslation, translationEnabled: true },
      afterSelection: { editor: "lyrics", start: 0, end: 0 },
      message: copy.splitResult
    });
  }

  function swapColumns() {
    commitOperation({
      label: copy.swapApply,
      next: swapLyricsColumns(documentSnapshot),
      afterSelection: { editor: "lyrics", start: 0, end: 0 },
      message: copy.swappedResult
    });
  }

  function undoOperation() {
    const result = undoLyricsOperation(historyRef.current);
    if (!result.entry || !result.snapshot || !result.selection) return;
    historyRef.current = result.history;
    expectedSnapshotRef.current = result.snapshot;
    pendingSelectionRef.current = result.selection;
    viewport.captureAnchor(result.selection.editor);
    setHistoryRevision((value) => value + 1);
    setFeedback({
      message: formatLyricsWorkspaceCopy(copy.undoneResult, { label: result.entry.label }),
      canUndo: result.history.past.length > 0
    });
    onLyricsDocumentChange(result.snapshot);
  }

  function redoOperation() {
    const result = redoLyricsOperation(historyRef.current);
    if (!result.entry || !result.snapshot || !result.selection) return;
    historyRef.current = result.history;
    expectedSnapshotRef.current = result.snapshot;
    pendingSelectionRef.current = result.selection;
    viewport.captureAnchor(result.selection.editor);
    setHistoryRevision((value) => value + 1);
    setFeedback({
      message: formatLyricsWorkspaceCopy(copy.redoneResult, { label: result.entry.label }),
      canUndo: true
    });
    onLyricsDocumentChange(result.snapshot);
  }

  function handleTranslationEnabledChange(enabled: boolean) {
    clearOperationHistory();
    if (!enabled && activeEditorRef.current === "translation") {
      viewport.captureAnchor("translation");
      activeEditorRef.current = "lyrics";
      const selection = clampSelection(selectionsRef.current.lyrics, lyrics.length);
      setCursor(cursorForSelection("lyrics", lyrics, selection.start));
    } else {
      viewport.captureAnchor(enabled ? "translation" : activeEditorRef.current);
    }
    onTranslationEnabledChange(enabled);
  }

  function locateIssue(editor: LyricsWorkbenchEditor, line: number) {
    const node = getEditor(editor);
    if (!node) return;
    const selection = getLyricsLineSelection(node.value, line);
    activeEditorRef.current = editor;
    node.focus({ preventScroll: true });
    node.setSelectionRange(selection.start, selection.end);
    setSelections((current) => ({ ...current, [editor]: selection }));
    setCursor(cursorForSelection(editor, node.value, selection.start));
    const scroll = scrollRef.current;
    if (scroll) {
      const total = Math.max(1, node.value.split(/\r?\n/u).length);
      const ratio = total > 1 ? (Math.max(1, line) - 1) / (total - 1) : 0;
      scroll.scrollTop = ratio * Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    }
  }

  function openTab(tab: LyricsSidebarTab, intent?: LyricsCommandIntent) {
    viewport.captureAnchor();
    onSidebarTabChange(tab);
    if (sideBySide) {
      if (layout.collapsed) onLayoutAction({ type: "expand" });
    } else {
      setMobileSidebarOpen(true);
    }
    if (intent) setFocusIntent(intent);
    if (intent === "ai" && showAiTranslate) onAITranslate();
  }

  function toggleSidebar() {
    viewport.captureAnchor();
    if (sideBySide) {
      onLayoutAction({ type: "toggle" });
    } else {
      setMobileSidebarOpen((value) => !value);
    }
  }

  function closeMobileSidebar() {
    setMobileSidebarOpen(false);
    setFocusIntent(null);
    window.requestAnimationFrame(() => sidebarToggleRef.current?.focus({ preventScroll: true }));
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
  const currentPosition = formatLyricsWorkspaceCopy(copy.currentPosition, {
    label: currentLabel,
    line: Math.min(cursor.line, currentTotalLines),
    total: currentTotalLines
  });
  const scopeLabel = formatLyricsWorkspaceCopy(
    activeScope.hasSelection ? copy.selectedLinesScope : copy.activeColumnScope,
    {
      label: currentLabel,
      start: activeScope.startLine,
      end: activeScope.endLine
    }
  );
  const collapsedEditorWidth = Math.max(
    0,
    split.geometry.viewportWidth
      - __internalLyricsWorkspaceLayout.COLLAPSED_TOOLS_WIDTH
      - __internalLyricsWorkspaceLayout.COLLAPSED_GAP
  );
  const splitTarget = sideBySide
    ? sidebarCollapsed
      ? {
          gridTemplateColumns: `${collapsedEditorWidth}px ${__internalLyricsWorkspaceLayout.COLLAPSED_TOOLS_WIDTH}px`,
          columnGap: `${__internalLyricsWorkspaceLayout.COLLAPSED_GAP}px`
        }
      : {
          gridTemplateColumns: `${split.geometry.editorWidth}px ${split.geometry.toolsWidth}px`,
          columnGap: `${split.geometry.gap}px`
        }
    : {
        gridTemplateColumns: "minmax(0, 1fr)",
        columnGap: "0px"
      };
  const splitTransition: Transition = reduceMotion || split.isDragging || !animateSidebarDisclosure
    ? reducedMotionTransition
    : { type: "spring", stiffness: 210, damping: 31, mass: 0.96 };
  const resizerLeft = sidebarCollapsed ? collapsedEditorWidth : split.geometry.editorWidth;
  void historyRevision;

  return (
    <div
      ref={workspaceRef}
      className="lyrics-workspace-surface relative flex min-h-0 flex-col overflow-hidden"
      style={{ height: viewport.viewportHeight }}
      data-lyrics-viewport-mode="immersive"
      data-testid="lyrics-workspace"
    >
      <LyricsCommandBar
        copy={copy}
        activeTab={sidebarTab}
        canUndo={historyRef.current.past.length > 0}
        canRedo={historyRef.current.future.length > 0}
        isAITranslating={isAITranslating}
        showAITranslate={showAiTranslate}
        lyricsFetchAction={lyricsFetchPanel}
        reviewAction={(
          <LyricsReviewMenu
            copy={copy}
            lineStatus={lineStatus}
            analysis={analysis}
            onLocate={locateIssue}
          />
        )}
        sidebarExpanded={sidebarExpanded}
        sidebarToggleRef={sidebarToggleRef}
        onUndo={undoOperation}
        onRedo={redoOperation}
        onCleanPaste={cleanPaste}
        onCollapseBlankLines={() => blankCleanup("collapse", false)}
        onStripLrc={cleanLrc}
        onAITranslate={() => openTab("translation", "ai")}
        onToggleSidebar={toggleSidebar}
      />

      <motion.div
        ref={split.viewportRef}
        className="lyrics-workspace-split relative grid min-h-0 flex-1 min-w-0 overflow-hidden"
        initial={false}
        animate={splitTarget}
        transition={splitTransition}
        data-side-by-side={sideBySide ? "true" : "false"}
        data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
        data-mobile-sidebar-open={mobileSidebarOpen ? "true" : "false"}
        data-editor-ratio={split.geometry.ratio.toFixed(4)}
        data-testid="lyrics-workspace-split"
      >
        <section
          id="lyrics-workspace-editor"
          className="lyrics-document-column flex min-h-0 min-w-0 flex-col overflow-hidden"
          aria-label={copy.manuscript}
          inert={!sideBySide && mobileSidebarOpen ? true : undefined}
        >
          <span className="sr-only">{copy.sharedScrollHint}</span>
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
            data-testid="lyrics-shared-scroll"
          >
            <div
              className={cn(
                "lyrics-editor-grid grid min-h-full min-w-0 items-start gap-3 p-3",
                showTranslation
                  ? "grid-cols-2 max-[620px]:grid-cols-1"
                  : "mx-auto w-full max-w-[52rem] grid-cols-1"
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
                  className="field-shell lyrics-document-editor control-focus block min-h-[280px] min-w-0 w-full resize-none overflow-x-hidden overflow-y-hidden rounded-lg px-3 py-3 text-sm leading-[1.75]"
                  data-testid="lyrics-editor-original"
                />
              </EditorColumn>
              {showTranslation ? (
                <EditorColumn label={copy.translation} htmlFor={translationId}>
                  <div
                    className="lyrics-translation-editor-shell rounded-[10px] p-px"
                    style={{ background: `color-mix(in srgb, ${themeColor} 24%, rgb(var(--input-border)))` }}
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
                      className="field-shell lyrics-document-editor control-focus block min-h-[280px] min-w-0 w-full resize-none overflow-x-hidden overflow-y-hidden rounded-[9px] border-transparent px-3 py-3 text-sm leading-[1.75]"
                      data-testid="lyrics-editor-translation"
                    />
                  </div>
                </EditorColumn>
              ) : null}
            </div>
          </div>
        </section>

        {!sideBySide && mobileSidebarOpen ? (
          <button
            type="button"
            className="lyrics-sidebar-backdrop absolute inset-0 z-30 bg-black/35"
            onClick={closeMobileSidebar}
            tabIndex={-1}
            aria-label={copy.closeDrawer}
            data-testid="lyrics-sidebar-backdrop"
          />
        ) : null}

        <LyricsSidebar
          copy={copy}
          activeTab={sidebarTab}
          activeEditor={cursor.editor}
          activeText={activeText}
          selection={activeSelection}
          lyrics={lyrics}
          translationText={translationText}
          translationEnabled={translationEnabled}
          locale={locale}
          themeColor={themeColor}
          t={t}
          open={sideBySide || mobileSidebarOpen}
          collapsed={sidebarCollapsed}
          mobileDrawer={!sideBySide}
          feedback={feedback}
          focusIntent={focusIntent}
          isAITranslating={isAITranslating}
          showAiTranslate={showAiTranslate}
          aiPanel={aiPanel}
          onTabChange={onSidebarTabChange}
          onOpenTab={openTab}
          onCloseDrawer={closeMobileSidebar}
          onIntentHandled={() => setFocusIntent(null)}
          onUndo={undoOperation}
          onBlankCleanup={blankCleanup}
          onCleanPaste={cleanPaste}
          onStripLrc={cleanLrc}
          onMergeSelectedLines={mergeLines}
          onRemoveParagraphTags={cleanParagraphTags}
          onTranslationEnabledChange={handleTranslationEnabledChange}
          onAITranslate={onAITranslate}
          onSplitAlternatingLyrics={splitAlternating}
          onFormatTranslation={formatTranslation}
          onSwapColumns={swapColumns}
        />

        {sideBySide && split.geometry.viewportWidth > 0 ? (
          <motion.div
            {...split.separatorProps}
            role={!sidebarCollapsed ? "separator" : undefined}
            aria-label={!sidebarCollapsed ? copy.resizeSidebar : undefined}
            aria-controls={!sidebarCollapsed ? "lyrics-workspace-editor lyrics-workspace-sidebar" : undefined}
            aria-orientation={!sidebarCollapsed ? "vertical" : undefined}
            aria-valuemin={!sidebarCollapsed ? Math.round(split.geometry.minRatio * 100) : undefined}
            aria-valuemax={!sidebarCollapsed ? Math.round(split.geometry.maxRatio * 100) : undefined}
            aria-valuenow={!sidebarCollapsed ? Math.round(split.geometry.ratio * 100) : undefined}
            aria-valuetext={!sidebarCollapsed
              ? `${Math.round(split.geometry.ratio * 100)}% / ${Math.round((1 - split.geometry.ratio) * 100)}%`
              : undefined}
            aria-hidden={sidebarCollapsed}
            inert={sidebarCollapsed ? true : undefined}
            tabIndex={sidebarCollapsed ? -1 : 0}
            title={!sidebarCollapsed ? copy.resizeSidebar : undefined}
            className="preview-workbench-resizer lyrics-workspace-resizer"
            data-testid={!sidebarCollapsed ? "lyrics-workspace-resizer" : undefined}
            data-dragging={split.isDragging ? "true" : "false"}
            data-motion-active={sidebarCollapsed ? "false" : "true"}
            initial={false}
            animate={{
              left: resizerLeft,
              opacity: sidebarCollapsed ? 0 : 1,
              scaleY: sidebarCollapsed ? 0.82 : 1
            }}
            transition={splitTransition}
            style={{
              width: split.geometry.gap,
              pointerEvents: sidebarCollapsed ? "none" : "auto",
              transformOrigin: "center"
            }}
          />
        ) : null}
      </motion.div>
      <LyricsStatusBar
        currentPosition={currentPosition}
        scopeLabel={scopeLabel}
      />
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

function cursorForSelection(
  editor: LyricsWorkbenchEditor,
  value: string,
  selectionStart: number
): CursorPosition {
  const totalLines = Math.max(1, value ? value.split(/\r?\n/u).length : 1);
  const line = value.slice(0, selectionStart).split(/\r?\n/u).length;
  return { editor, line, totalLines };
}

function getTextStats(text: string) {
  const lines = text ? text.split(/\r?\n/u).length : 0;
  return { lines, characters: text.length };
}

function clampSelection(
  selection: LyricsTextSelection,
  textLength: number
): LyricsTextSelection {
  const start = Math.min(textLength, Math.max(0, selection.start));
  const end = Math.min(textLength, Math.max(start, selection.end));
  return { start, end };
}
