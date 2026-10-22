"use client";

import {
  type ReactNode,
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
  type LyricsCommandIntent
} from "@/components/editor/LyricsCommandBar";
import { LyricsReviewPanel } from "@/components/editor/LyricsReviewMenu";
import { LyricsToolPalette } from "@/components/editor/LyricsToolPalette";
import { getLyricsToolsCopy } from "@/lib/lyrics-tools-copy";
import { LYRICS_TOOLS, type LyricsTool } from "@/lib/lyrics-tool-registry";
import { LyricsSidebar } from "@/components/editor/LyricsSidebar";
import {
  LandscapeLineLimitAlert,
  type LandscapeLineLimitNotice
} from "@/components/editor/LandscapeLineLimitAlert";
import { getLyricsWorkspaceCopy } from "@/components/editor/lyrics-workspace-copy";
import { useLyricsWorkspaceDocumentController } from "@/components/editor/hooks/useLyricsWorkspaceDocumentController";
import { useLyricsWorkspaceSplit } from "@/components/editor/hooks/useLyricsWorkspaceSplit";
import {
  type LyricsEditorKey,
  useLyricsViewportSession
} from "@/components/editor/hooks/useLyricsViewportSession";
import { Section } from "@/components/ui/controls";
import { AtomicLyricsTextarea } from "@/components/editor/AtomicLyricsTextarea";
import { separatorCopy } from "@/lib/lyric-separator-copy";
import type { createT } from "@/lib/i18n";
import type { ExportLyricLineStatus } from "@/lib/lyrics-document";
import {
  analyzeLyricsDocument,
  type LyricsDocumentSnapshot,
  type LyricsSidebarTab,
  type LyricsWorkbenchEditor
} from "@/lib/lyrics-workbench";
import type { ContentMode, Locale } from "@/lib/types";
import type { LyricDocumentV2 } from "@/lib/lyrics-document-v2";
import { cn } from "@/lib/utils";

type LyricsWorkspaceProps = {
  lyricDocument: LyricDocumentV2;
  lyrics: string;
  lineStatus: ExportLyricLineStatus;
  landscapeLineLimitNotice: LandscapeLineLimitNotice | null;
  onDismissLandscapeLineLimitNotice: () => void;
  sidebarTab: LyricsSidebarTab;
  onSidebarTabChange: (tab: LyricsSidebarTab) => void;
  onLyricsChange: (lyrics: string) => void;
  translationEnabled: boolean;
  translationText: string;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translation: string) => void;
  onLyricsDocumentChange: (snapshot: LyricsDocumentSnapshot) => void;
  onAITranslate: () => void;
  onCloseAITranslate: () => void;
  onCancelAITranslate: () => void;
  isAITranslating: boolean;
  aiPanel?: ReactNode;
  lyricsFetchPanel?: ReactNode;
  themeColor: string;
  contentMode: ContentMode;
  locale: Locale;
  t: ReturnType<typeof createT>;
  showAiTranslate?: boolean;
};

export function LyricsWorkspace({
  lyricDocument,
  lyrics,
  lineStatus,
  landscapeLineLimitNotice,
  onDismissLandscapeLineLimitNotice,
  sidebarTab,
  onSidebarTabChange,
  translationEnabled,
  translationText,
  onTranslationEnabledChange,
  onLyricsDocumentChange,
  onAITranslate,
  onCloseAITranslate,
  onCancelAITranslate,
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
  const nav = getLyricsToolsCopy(locale);
  const separatorLabels = separatorCopy[locale];
  const workspaceRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const translationRef = useRef<HTMLTextAreaElement>(null);
  const lyricsMeasureRef = useRef<HTMLTextAreaElement>(null);
  const translationMeasureRef = useRef<HTMLTextAreaElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  // Unmount cleanup reads the latest AI lifecycle without resubscribing the effect.
  const aiLifecycleRef = useRef({
    open: Boolean(aiPanel),
    translating: isAITranslating,
    close: onCloseAITranslate,
    cancel: onCancelAITranslate
  });
  aiLifecycleRef.current = {
    open: Boolean(aiPanel),
    translating: isAITranslating,
    close: onCloseAITranslate,
    cancel: onCancelAITranslate
  };
  const activeEditorRef = useRef<LyricsWorkbenchEditor>("lyrics");
  const lyricsId = useId();
  const translationId = useId();
  const showTranslation = contentMode === "lyrics" && translationEnabled;
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toolRequest, setToolRequest] = useState<LyricsTool | null>(null);
  const [translationHome, setTranslationHome] = useState(false);
  const [focusIntent, setFocusIntent] = useState<LyricsCommandIntent | null>(null);
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
  const split = useLyricsWorkspaceSplit();
  const sideBySide = split.isDesktop;
  const analysis = useMemo(() => analyzeLyricsDocument({
    lyrics,
    translationText,
    translationEnabled: showTranslation
  }), [lyrics, showTranslation, translationText]);

  useEffect(() => () => {
    const ai = aiLifecycleRef.current;
    if (!ai.open) return;
    if (ai.translating) ai.cancel();
    ai.close();
  }, []);

  const resizeEditors = useCallback(() => {
    const entries = [
      { editor: lyricsRef.current, measure: lyricsMeasureRef.current },
      showTranslation
        ? { editor: translationRef.current, measure: translationMeasureRef.current }
        : null
    ].filter((entry): entry is { editor: HTMLTextAreaElement; measure: HTMLTextAreaElement } => (
      Boolean(entry?.editor && entry.measure)
    ));
    if (entries.length === 0) return false;
    const viewportFloor = Math.max(280, (scrollRef.current?.clientHeight ?? 0) - 24);
    // Equal heights make both lyric columns share one scroll coordinate system.
    // React has already committed mirror values, so this phase batches every read
    // before writing the final height to either live textarea.
    const commonHeight = Math.max(viewportFloor, ...entries.map(({ measure }) => measure.scrollHeight));
    const nextHeight = `${commonHeight}px`;
    let changed = false;
    for (const { editor } of entries) {
      if (editor.style.height === nextHeight) continue;
      editor.style.height = nextHeight;
      changed = true;
    }
    return changed;
  }, [showTranslation]);

  const previousViewportHeightRef = useRef(viewport.viewportHeight);
  const previousShowTranslationRef = useRef(showTranslation);
  useLayoutEffect(() => {
    const viewportChanged = previousViewportHeightRef.current !== viewport.viewportHeight;
    const translationLayoutChanged = previousShowTranslationRef.current !== showTranslation;
    previousViewportHeightRef.current = viewport.viewportHeight;
    previousShowTranslationRef.current = showTranslation;
    if (resizeEditors() || viewportChanged || translationLayoutChanged) {
      viewport.restoreAnchor();
    }
  }, [lyrics, resizeEditors, translationText, viewport.restoreAnchor, viewport.viewportHeight]);

  const documentController = useLyricsWorkspaceDocumentController({
    copy,
    separatorLabels,
    lyricDocument,
    lyrics,
    translationText,
    translationEnabled,
    showTranslation,
    scrollRef,
    activeEditorRef,
    getEditor,
    captureViewportAnchor: viewport.captureAnchor,
    restoreViewportAnchor: viewport.restoreAnchor,
    onTranslationEnabledChange,
    onLyricsDocumentChange
  });

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      resizeEditors();
      viewport.restoreAnchor();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [resizeEditors, viewport.restoreAnchor]);

  function openTab(tab: LyricsSidebarTab, intent?: LyricsCommandIntent) {
    // Capture semantic position before the sidebar changes the editor's available width.
    viewport.captureAnchor();
    onSidebarTabChange(tab);
    setSidebarCollapsed(false);
    if (!sideBySide) {
      setMobileSidebarOpen(true);
    }
    if (intent) setFocusIntent(intent);
    if (intent === "ai" && showAiTranslate) { setTranslationHome(false); onAITranslate(); }
  }

  function toggleSidebar() {
    viewport.captureAnchor();
    if (sideBySide) setSidebarCollapsed(value => !value);
    else setMobileSidebarOpen((value) => !value);
  }

  function closeMobileSidebar() {
    if (aiPanel) {
      if (isAITranslating) onCancelAITranslate();
      onCloseAITranslate();
    }
    setMobileSidebarOpen(false);
    setFocusIntent(null);
    window.requestAnimationFrame(() => sidebarToggleRef.current?.focus({ preventScroll: true }));
  }

  useEffect(() => {
    function onSearchKey(event: KeyboardEvent) {
      // Escape must also work before the dialog's first focus frame, without
      // reaching the underlying AI/drawer escape stack.
      if (paletteOpen && event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        setPaletteOpen(false);
        return;
      }
      if (!paletteOpen && workspaceRef.current?.closest("[data-app-commands=true]")) return;
      if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      if (!workspaceRef.current?.getClientRects().length || contentMode !== "lyrics") return;
      if (!paletteOpen && workspaceRef.current.closest("[inert], [hidden], [aria-hidden=true]")) return;
      event.preventDefault();
      if (!paletteOpen) viewport.captureAnchor();
      setPaletteOpen(value => !value);
    }
    document.addEventListener("keydown", onSearchKey, true);
    return () => document.removeEventListener("keydown", onSearchKey, true);
  }, [contentMode, paletteOpen, viewport.captureAnchor]);

  useEffect(() => {
    if (!toolRequest) return;
    // A palette command runs after modal inert/focus cleanup and on the active page only.
    const frame = requestAnimationFrame(() => {
      const target = workspaceRef.current?.querySelector<HTMLElement>('[data-testid="' + toolRequest.target + '"]');
      if (target && !target.closest("[inert], [hidden]")) {
        target.scrollIntoView({ block: "nearest" });
        const disabled = target.matches(":disabled");
        const focusTarget = disabled ? target.closest<HTMLElement>('[role="tabpanel"]') ?? getEditor(activeEditorRef.current) : target;
        focusTarget?.focus({ preventScroll: true });
        if (toolRequest.mode !== "locate" && !disabled) target.click();
      }
      setToolRequest(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [toolRequest, sidebarTab, sidebarCollapsed, mobileSidebarOpen, getEditor]);

  useEffect(() => {
    const activate = (event: Event) => {
      const tool = LYRICS_TOOLS.find(item => item.id === (event as CustomEvent<string>).detail);
      const root = workspaceRef.current;
      if (tool && contentMode === "lyrics" && root?.getClientRects().length && !root.closest("[inert], [aria-hidden=true]")) activateTool(tool);
    };
    window.addEventListener("lyrics-card:activate-tool", activate);
    return () => window.removeEventListener("lyrics-card:activate-tool", activate);
  });

  function activateTool(tool: LyricsTool) {
    if (tool.id === "ai") { openTab("translation", "ai"); return; }
    if (["undo", "redo", "fetch"].includes(tool.id)) {
      if (!sideBySide) setMobileSidebarOpen(false);
      setToolRequest(tool);
      return;
    }
    openTab(tool.category);
    if (tool.category === "translation") setTranslationHome(true);
    setToolRequest(tool);
  }

  function locateIssue(editor: LyricsWorkbenchEditor, line: number) {
    if (!sideBySide) setMobileSidebarOpen(false);
    requestAnimationFrame(() => documentController.locateIssue(editor, line));
  }

  const hasLrcInScope = /^\s*\[(?:\d{1,3}:\d{2}|(?:ar|ti|al|by|offset):)/imu.test(documentController.activeScope.text);

  if (contentMode !== "lyrics") {
    return (
      <Section title={t("lyrics")}>
        <p className="app-text-subtle text-sm">{t("instrumentalMode")}</p>
      </Section>
    );
  }

  const splitStyle = sideBySide && !sidebarCollapsed
    ? {
        gridTemplateColumns: `${split.geometry.editorWidth}px ${split.geometry.toolsWidth}px`,
        columnGap: `${split.geometry.gap}px`
      }
    : {
        gridTemplateColumns: "minmax(0, 1fr)",
        columnGap: "0px"
      };

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
        canUndo={documentController.canUndo}
        canRedo={documentController.canRedo}
        isAITranslating={isAITranslating}
        showAITranslate={showAiTranslate}
        lyricsFetchAction={lyricsFetchPanel}
        onSearch={() => { viewport.captureAnchor(); setPaletteOpen(true); }}
        searchLabel={nav.search}
        sidebarLabel={sideBySide ? (sidebarCollapsed ? nav.expand : nav.collapse) : (mobileSidebarOpen ? copy.closeDrawer : copy.openDrawer)}
        currentPosition={documentController.currentPosition}
        scopeLabel={documentController.scopeLabel}
        sidebarExpanded={sideBySide ? !sidebarCollapsed : mobileSidebarOpen}
        showSidebarToggle
        sidebarToggleRef={sidebarToggleRef}
        onUndo={documentController.undoOperation}
        onRedo={documentController.redoOperation}
        onAITranslate={() => openTab("translation", "ai")}
        onToggleSidebar={toggleSidebar}
      />

      <LyricsToolPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onActivate={activateTool}
        copy={copy} locale={locale} showAiTranslate={showAiTranslate} hasFetch={Boolean(lyricsFetchPanel)} />
      {documentController.activeScope.hasSelection || hasLrcInScope ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pb-2 text-xs" data-testid="lyrics-context-actions">
          <span className="app-text-subtle">{documentController.scopeLabel}</span>
          {documentController.activeScope.hasSelection ? <button type="button" className="app-button control-focus rounded-md px-2 py-1" onClick={() => activateTool(LYRICS_TOOLS.find(tool => tool.id === "keep")!)}>{copy.keepSelection}</button> : null}
          {documentController.activeScope.hasSelection && documentController.activeScope.endLine > documentController.activeScope.startLine ? <button type="button" className="app-button control-focus rounded-md px-2 py-1" onClick={documentController.mergeLines}>{copy.mergeHeading}</button> : null}
          {hasLrcInScope ? <button type="button" className="app-button control-focus rounded-md px-2 py-1" onClick={() => activateTool(LYRICS_TOOLS.find(tool => tool.id === "lrc")!)}>{copy.previewLrc}</button> : null}
        </div>
      ) : null}
      <LandscapeLineLimitAlert
        notice={landscapeLineLimitNotice}
        onDismiss={onDismissLandscapeLineLimitNotice}
        t={t}
      />

      <div
        ref={split.viewportRef}
        className="lyrics-workspace-split relative grid min-h-0 flex-1 min-w-0 overflow-hidden"
        style={splitStyle}
        data-side-by-side={sideBySide ? "true" : "false"}
        data-mobile-sidebar-open={mobileSidebarOpen ? "true" : "false"}
        data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
        data-editor-ratio={split.geometry.ratio.toFixed(4)}
        data-testid="lyrics-workspace-split"
      >
        {/* The covered editor must leave the mobile drawer's focus and accessibility tree. */}
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
                  ? "mx-auto w-full max-w-[88rem] grid-cols-2 max-[620px]:grid-cols-1"
                  : "mx-auto w-full max-w-[52rem] grid-cols-1"
              )}
              data-testid="lyrics-editor-columns"
              data-bilingual={showTranslation ? "true" : "false"}
            >
              <EditorColumn label={copy.original} htmlFor={lyricsId} active={documentController.activeEditor === "lyrics"} activeLabel={copy.activeColumn}>
                <div className="relative min-w-0">
                  <AtomicLyricsTextarea
                    ref={lyricsRef}
                    separatorHint={separatorLabels.tooltip}
                    onUndo={documentController.undoOperation}
                    onRedo={documentController.redoOperation}
                    canUndo={documentController.canUndo}
                    canRedo={documentController.canRedo}
                    id={lyricsId}
                    value={lyrics}
                    onChange={documentController.onLyricsEditorChange}
                    onFocus={(event) => documentController.onEditorFocus(event, "lyrics")}
                    onSelect={(event) => documentController.updateCursor(event, "lyrics")}
                    onKeyUp={(event) => documentController.updateCursor(event, "lyrics")}
                    onClick={(event) => documentController.updateCursor(event, "lyrics")}
                    wrap="soft"
                    placeholder={t("lyricPlaceholder")}
                    className="field-shell lyrics-document-editor control-focus block min-h-[280px] min-w-0 w-full resize-none overflow-x-hidden overflow-y-hidden rounded-lg px-3 py-3 text-sm leading-[1.75]"
                    data-testid="lyrics-editor-original"
                  />
                  <EditorMeasurementMirror
                    measureRef={lyricsMeasureRef}
                    value={lyrics}
                    className="field-shell lyrics-document-editor block min-h-[280px] min-w-0 w-full resize-none overflow-x-hidden overflow-y-hidden rounded-lg px-3 py-3 text-sm leading-[1.75]"
                  />
                </div>
              </EditorColumn>
              {showTranslation ? (
                <EditorColumn label={copy.translation} htmlFor={translationId} active={documentController.activeEditor === "translation"} activeLabel={copy.activeColumn}>
                  <div
                    className="lyrics-translation-editor-shell rounded-[10px] p-px"
                    style={{ background: `color-mix(in srgb, ${themeColor} 24%, rgb(var(--input-border)))` }}
                  >
                    <div className="relative min-w-0">
                      <AtomicLyricsTextarea
                        ref={translationRef}
                        separatorHint={separatorLabels.tooltip}
                        onUndo={documentController.undoOperation}
                        onRedo={documentController.redoOperation}
                        canUndo={documentController.canUndo}
                        canRedo={documentController.canRedo}
                        id={translationId}
                        value={translationText}
                        onChange={documentController.onTranslationEditorChange}
                        onFocus={(event) => documentController.onEditorFocus(event, "translation")}
                        onSelect={(event) => documentController.updateCursor(event, "translation")}
                        onKeyUp={(event) => documentController.updateCursor(event, "translation")}
                        onClick={(event) => documentController.updateCursor(event, "translation")}
                        wrap="soft"
                        placeholder={t("translationPlaceholder")}
                        className="field-shell lyrics-document-editor control-focus block min-h-[280px] min-w-0 w-full resize-none overflow-x-hidden overflow-y-hidden rounded-[9px] border-transparent px-3 py-3 text-sm leading-[1.75]"
                        data-testid="lyrics-editor-translation"
                      />
                      <EditorMeasurementMirror
                        measureRef={translationMeasureRef}
                        value={translationText}
                        className="field-shell lyrics-document-editor block min-h-[280px] min-w-0 w-full resize-none overflow-x-hidden overflow-y-hidden rounded-[9px] border-transparent px-3 py-3 text-sm leading-[1.75]"
                      />
                    </div>
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
          activeEditor={documentController.activeEditor}
          activeText={documentController.activeText}
          selection={documentController.activeSelection}
          lyrics={lyrics}
          translationText={translationText}
          translationEnabled={translationEnabled}
          locale={locale}
          themeColor={themeColor}
          t={t}
          open={sideBySide ? !sidebarCollapsed : mobileSidebarOpen}
          onSearch={() => { viewport.captureAnchor(); setPaletteOpen(true); }}
          searchLabel={nav.search}
          reviewCount={analysis.issues.length + (analysis.lineDifference ? 1 : 0) + (lineStatus.isOverLimit ? 1 : 0)}
          reviewPanel={<LyricsReviewPanel copy={copy} lineStatus={lineStatus} analysis={analysis} translationEnabled={showTranslation} onLocate={locateIssue} />}
          mobileDrawer={!sideBySide}
          feedback={documentController.feedback}
          focusIntent={focusIntent}
          isAITranslating={isAITranslating}
          showAiTranslate={showAiTranslate}
          aiPanel={aiPanel}
          translationHome={translationHome}
          toolNavigation={Boolean(toolRequest)}
          onTabChange={(tab) => { setTranslationHome(false); onSidebarTabChange(tab); }}
          onCloseDrawer={closeMobileSidebar}
          onIntentHandled={() => setFocusIntent(null)}
          onUndo={documentController.undoOperation}
          onBlankCleanup={documentController.blankCleanup}
          onKeepSelection={documentController.keepSelection}
          onInsertSeparator={documentController.insertSeparatorAtCursor}
          onCleanPaste={documentController.cleanPaste}
          onStripLrc={documentController.cleanLrc}
          onMergeSelectedLines={documentController.mergeLines}
          onRemoveParagraphTags={documentController.cleanParagraphTags}
          onTranslationEnabledChange={documentController.handleTranslationEnabledChange}
          onAITranslate={() => { setTranslationHome(false); onAITranslate(); }}
          onCloseAITranslate={onCloseAITranslate}
          onCancelAITranslate={onCancelAITranslate}
          onSplitAlternatingLyrics={documentController.splitAlternating}
          onFormatTranslation={documentController.formatTranslation}
          onSwapColumns={documentController.swapColumns}
        />
      </div>
    </div>
  );
}

function EditorMeasurementMirror({
  measureRef,
  value,
  className
}: {
  measureRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  className: string;
}) {
  return (
    <textarea
      ref={measureRef}
      value={value}
      readOnly
      tabIndex={-1}
      aria-hidden="true"
      wrap="soft"
      className={className}
      data-lyrics-editor-measure="true"
      style={{
        position: "absolute",
        inset: "0 auto auto 0",
        width: "100%",
        height: "0px",
        minHeight: "0px",
        maxHeight: "none",
        visibility: "hidden",
        pointerEvents: "none",
        contain: "layout paint"
      }}
    />
  );
}

function EditorColumn({
  label,
  htmlFor,
  active,
  activeLabel,
  children
}: {
  label: string;
  htmlFor: string;
  active: boolean;
  activeLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0" data-editor-column-active={active ? "true" : "false"}>
      <label htmlFor={htmlFor} className="lyrics-editor-column-heading sticky top-0 z-10 mb-1 flex min-h-9 items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold">
        <span>{label}</span>
        {active ? <span aria-hidden="true" className="text-xs font-medium">{activeLabel}</span> : null}
      </label>
      {children}
    </div>
  );
}
