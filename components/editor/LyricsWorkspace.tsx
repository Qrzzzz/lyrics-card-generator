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
import { LyricsReviewMenu } from "@/components/editor/LyricsReviewMenu";
import { LyricsSidebar } from "@/components/editor/LyricsSidebar";
import { getLyricsWorkspaceCopy } from "@/components/editor/lyrics-workspace-copy";
import { useLyricsWorkspaceDocumentController } from "@/components/editor/hooks/useLyricsWorkspaceDocumentController";
import { useLyricsWorkspaceSplit } from "@/components/editor/hooks/useLyricsWorkspaceSplit";
import {
  type LyricsEditorKey,
  useLyricsViewportSession
} from "@/components/editor/hooks/useLyricsViewportSession";
import { Section } from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import type { ExportLyricLineStatus } from "@/lib/lyrics-document";
import {
  analyzeLyricsDocument,
  type LyricsDocumentSnapshot,
  type LyricsSidebarTab,
  type LyricsWorkbenchEditor
} from "@/lib/lyrics-workbench";
import type { ContentMode, Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

type LyricsWorkspaceProps = {
  lyrics: string;
  lineStatus: ExportLyricLineStatus;
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
  lyrics,
  lineStatus,
  sidebarTab,
  onSidebarTabChange,
  onLyricsChange,
  translationEnabled,
  translationText,
  onTranslationEnabledChange,
  onTranslationTextChange,
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
  const workspaceRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const translationRef = useRef<HTMLTextAreaElement>(null);
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
    const editors = [lyricsRef.current, showTranslation ? translationRef.current : null].filter(Boolean) as HTMLTextAreaElement[];
    if (editors.length === 0) return;
    for (const editor of editors) editor.style.height = "auto";
    const viewportFloor = Math.max(280, (scrollRef.current?.clientHeight ?? 0) - 24);
    // Equal heights make both lyric columns share one scroll coordinate system.
    const commonHeight = Math.max(viewportFloor, ...editors.map((editor) => editor.scrollHeight));
    for (const editor of editors) editor.style.height = `${commonHeight}px`;
  }, [showTranslation]);

  useLayoutEffect(() => {
    viewport.restoreAnchor();
    resizeEditors();
  }, [lyrics, resizeEditors, translationText, viewport.restoreAnchor, viewport.viewportHeight]);

  const documentController = useLyricsWorkspaceDocumentController({
    copy,
    lyrics,
    translationText,
    translationEnabled,
    showTranslation,
    scrollRef,
    activeEditorRef,
    getEditor,
    captureViewportAnchor: viewport.captureAnchor,
    restoreViewportAnchor: viewport.restoreAnchor,
    onLyricsChange,
    onTranslationEnabledChange,
    onTranslationTextChange,
    onLyricsDocumentChange
  });

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

  function openTab(tab: LyricsSidebarTab, intent?: LyricsCommandIntent) {
    // Capture semantic position before the sidebar changes the editor's available width.
    viewport.captureAnchor();
    onSidebarTabChange(tab);
    if (!sideBySide) {
      setMobileSidebarOpen(true);
    }
    if (intent) setFocusIntent(intent);
    if (intent === "ai" && showAiTranslate) onAITranslate();
  }

  function toggleSidebar() {
    viewport.captureAnchor();
    setMobileSidebarOpen((value) => !value);
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

  if (contentMode !== "lyrics") {
    return (
      <Section title={t("lyrics")}>
        <p className="app-text-subtle text-sm">{t("instrumentalMode")}</p>
      </Section>
    );
  }

  const splitStyle = sideBySide
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
        reviewAction={(
          <LyricsReviewMenu
            copy={copy}
            lineStatus={lineStatus}
            analysis={analysis}
            onLocate={documentController.locateIssue}
          />
        )}
        currentPosition={documentController.currentPosition}
        scopeLabel={documentController.scopeLabel}
        sidebarExpanded={mobileSidebarOpen}
        showSidebarToggle={!sideBySide}
        sidebarToggleRef={sidebarToggleRef}
        onUndo={documentController.undoOperation}
        onRedo={documentController.redoOperation}
        onCleanPaste={documentController.cleanPaste}
        onCollapseBlankLines={() => documentController.blankCleanup("collapse", false)}
        onStripLrc={documentController.cleanLrc}
        onAITranslate={() => openTab("translation", "ai")}
        onToggleSidebar={toggleSidebar}
      />

      <div
        ref={split.viewportRef}
        className="lyrics-workspace-split relative grid min-h-0 flex-1 min-w-0 overflow-hidden"
        style={splitStyle}
        data-side-by-side={sideBySide ? "true" : "false"}
        data-mobile-sidebar-open={mobileSidebarOpen ? "true" : "false"}
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
          open={sideBySide || mobileSidebarOpen}
          mobileDrawer={!sideBySide}
          feedback={documentController.feedback}
          focusIntent={focusIntent}
          isAITranslating={isAITranslating}
          showAiTranslate={showAiTranslate}
          aiPanel={aiPanel}
          onTabChange={onSidebarTabChange}
          onCloseDrawer={closeMobileSidebar}
          onIntentHandled={() => setFocusIntent(null)}
          onUndo={documentController.undoOperation}
          onBlankCleanup={documentController.blankCleanup}
          onCleanPaste={documentController.cleanPaste}
          onStripLrc={documentController.cleanLrc}
          onMergeSelectedLines={documentController.mergeLines}
          onRemoveParagraphTags={documentController.cleanParagraphTags}
          onTranslationEnabledChange={documentController.handleTranslationEnabledChange}
          onAITranslate={onAITranslate}
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
