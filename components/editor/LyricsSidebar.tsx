"use client";

import { motion } from "framer-motion";
import {
  ChevronDown,
  Eraser,
  Languages,
  X
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AiTranslateButton } from "@/components/lyrics/AiTranslateButton";
import type { LyricsCommandIntent } from "@/components/editor/LyricsCommandBar";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import {
  formatLyricsWorkspaceCopy,
  type LyricsWorkspaceCopy
} from "@/components/editor/lyrics-workspace-copy";
import { Section, ToggleRow } from "@/components/ui/controls";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { createT } from "@/lib/i18n";
import { formatChineseTranslation, splitAlternatingLyrics } from "@/lib/lyric-format";
import {
  cleanSynchronizedBlankRows,
  previewParagraphTags,
  removeAllBlankLines,
  resolveLyricsTextScope,
  stripLrcTimeline,
  type LyricsBlankMode,
  type LyricsSidebarTab,
  type LyricsTextSelection,
  type LyricsWorkbenchEditor
} from "@/lib/lyrics-workbench";
import type { Locale } from "@/lib/types";
import {
  reducedMotionTransition,
  sidebarPageTransition,
} from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

type LyricsSidebarProps = {
  copy: LyricsWorkspaceCopy;
  activeTab: LyricsSidebarTab;
  activeEditor: LyricsWorkbenchEditor;
  activeText: string;
  selection: LyricsTextSelection;
  lyrics: string;
  translationText: string;
  translationEnabled: boolean;
  locale: Locale;
  themeColor: string;
  t: ReturnType<typeof createT>;
  open: boolean;
  mobileDrawer: boolean;
  feedback: { message: string; canUndo: boolean } | null;
  focusIntent: LyricsCommandIntent | null;
  isAITranslating: boolean;
  showAiTranslate: boolean;
  aiPanel?: ReactNode;
  onTabChange: (tab: LyricsSidebarTab) => void;
  onCloseDrawer: () => void;
  onIntentHandled: () => void;
  onUndo: () => void;
  onBlankCleanup: (mode: LyricsBlankMode, synchronized: boolean) => void;
  onCleanPaste: () => void;
  onStripLrc: () => void;
  onMergeSelectedLines: () => void;
  onRemoveParagraphTags: () => void;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onAITranslate: () => void;
  onCloseAITranslate: () => void;
  onCancelAITranslate: () => void;
  onSplitAlternatingLyrics: (lyrics: string, translationText: string) => void;
  onFormatTranslation: (translationText: string) => void;
  onSwapColumns: () => void;
};

const TABS: LyricsSidebarTab[] = ["cleanup", "translation"];
type LyricsSidebarPage = "cleanup" | "translation" | "ai";

const SIDEBAR_PAGE_INDEX: Record<LyricsSidebarPage, number> = {
  cleanup: 0,
  translation: 1,
  ai: 2
};

function resolveSidebarPage(activeTab: LyricsSidebarTab, aiPanel: ReactNode | undefined): LyricsSidebarPage {
  if (activeTab === "cleanup") return "cleanup";
  return aiPanel ? "ai" : "translation";
}

export function LyricsSidebar(props: LyricsSidebarProps) {
  const {
    copy,
    activeTab,
    open,
    mobileDrawer,
    feedback,
    focusIntent,
    aiPanel,
    isAITranslating,
    onTabChange,
    onCloseDrawer,
    onIntentHandled,
    onCloseAITranslate,
    onCancelAITranslate,
    onUndo
  } = props;
  const closeDrawerButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerOpenRef = useRef(false);
  const reduceMotion = useAppReducedMotion();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const aiPageRef = useRef<HTMLElement | null>(null);
  const aiButtonRef = useRef<HTMLButtonElement | null>(null);
  const activePage = resolveSidebarPage(activeTab, aiPanel);
  const previousPageRef = useRef<LyricsSidebarPage>(activePage);
  const retainedAiPanelRef = useRef<ReactNode>(aiPanel);
  const [transitionFrom, setTransitionFrom] = useState<LyricsSidebarPage | null>(null);
  const pendingFocusRef = useRef<"translation" | "ai" | null>(null);
  const pageChangingFrom = previousPageRef.current === activePage
    ? null
    : previousPageRef.current;
  const visibleTransitionFrom = transitionFrom ?? pageChangingFrom;
  if (aiPanel) retainedAiPanelRef.current = aiPanel;
  const renderedAiPanel = aiPanel ?? (
    pageChangingFrom === "ai" || transitionFrom === "ai"
      ? retainedAiPanelRef.current
      : null
  );

  const focusAiPagePrimary = useCallback(() => {
    const target = aiPageRef.current?.querySelector<HTMLButtonElement>(
      '[data-testid="ai-translate-run-page"][data-page-active="true"] [data-testid="lyrics-ai-run-page-back"], [data-testid="lyrics-ai-page-back"]'
    );
    target?.focus({ preventScroll: true });
    return Boolean(target);
  }, []);

  const focusEnteredPage = useCallback((page: LyricsSidebarPage) => {
    if (page !== activePage) return;
    setTransitionFrom(null);
    if (pendingFocusRef.current === "ai" && page === "ai") {
      pendingFocusRef.current = null;
      focusAiPagePrimary();
      if (focusIntent === "ai") onIntentHandled();
      return;
    }
    if (pendingFocusRef.current === "translation" && page === "translation") {
      pendingFocusRef.current = null;
      aiButtonRef.current?.focus({ preventScroll: true });
    }
  }, [activePage, focusAiPagePrimary, focusIntent, onIntentHandled]);

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: LyricsSidebarTab) {
    const currentIndex = TABS.indexOf(tab);
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % TABS.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + TABS.length) % TABS.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? TABS.length - 1
            : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = TABS[nextIndex];
    onTabChange(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById(`lyrics-sidebar-tab-${nextTab}`)?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    const drawerOpen = open && mobileDrawer;
    const wasOpen = drawerOpenRef.current;
    drawerOpenRef.current = drawerOpen;
    if (!drawerOpen || wasOpen || focusIntent) return;
    const frame = window.requestAnimationFrame(() => {
      closeDrawerButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusIntent, mobileDrawer, open]);

  useLayoutEffect(() => {
    const previousPage = previousPageRef.current;
    if (previousPage === activePage) return;
    previousPageRef.current = activePage;
    setTransitionFrom(previousPage);

    const activeElement = document.activeElement;
    const contentHadFocus = activeElement instanceof HTMLElement && Boolean(
      activeElement.closest("[data-lyrics-sidebar-page]")
    );
    if (contentHadFocus) {
      pendingFocusRef.current = activePage === "ai"
        ? "ai"
        : activePage === "translation"
          ? "translation"
          : null;
      viewportRef.current?.focus({ preventScroll: true });
    } else if (focusIntent === "ai" && activePage === "ai") {
      pendingFocusRef.current = "ai";
    }

    if (activePage === "ai") aiPageRef.current?.scrollTo({ top: 0 });
  }, [activePage, focusIntent]);

  useEffect(() => {
    if (focusIntent !== "ai" || activePage !== "ai" || pendingFocusRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      focusAiPagePrimary();
      onIntentHandled();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePage, focusAiPagePrimary, focusIntent, onIntentHandled]);

  useEffect(() => {
    if (!reduceMotion || !transitionFrom) return;
    const frame = window.requestAnimationFrame(() => focusEnteredPage(activePage));
    return () => window.cancelAnimationFrame(frame);
  }, [activePage, focusEnteredPage, reduceMotion, transitionFrom]);

  function onDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!mobileDrawer) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const activeRunPageBack = event.currentTarget.querySelector<HTMLButtonElement>(
        '[data-testid="ai-translate-run-page"][data-page-active="true"] [data-testid="lyrics-ai-run-page-back"]'
      );
      if (activeRunPageBack) {
        activeRunPageBack.click();
        return;
      }
      if (aiPanel) {
        if (isAITranslating) onCancelAITranslate();
        onCloseAITranslate();
        return;
      }
      onCloseDrawer();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
    )].filter((node) => (
      node.tabIndex >= 0 &&
      !node.closest("[hidden], [inert]") &&
      node.getClientRects().length > 0
    ));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  return (
    <aside
      id="lyrics-workspace-sidebar"
      aria-label={copy.sidebar}
      aria-modal={mobileDrawer ? true : undefined}
      role={mobileDrawer ? "dialog" : undefined}
      hidden={!open}
      onKeyDown={onDrawerKeyDown}
      className={cn(
        "lyrics-sidebar app-text-muted h-full min-h-0 min-w-0 overflow-hidden",
        mobileDrawer && "lyrics-sidebar--drawer"
      )}
      data-testid="lyrics-sidebar"
      data-mobile-drawer={mobileDrawer ? "true" : "false"}
      data-active-tab={activeTab}
    >
      <div className="flex h-full min-h-0 flex-col">
          <header className="lyrics-sidebar-header flex shrink-0 items-center gap-2 border-b border-[rgb(var(--panel-border))] p-2">
            <div
              role="tablist"
              aria-label={copy.sidebar}
              className="segmented-control lyrics-sidebar-tabs grid min-w-0 flex-1 grid-cols-2"
              style={{
                "--segmented-count": 2,
                "--segmented-active-translate": activeTab === "cleanup" ? "0%" : "100%"
              } as CSSProperties}
            >
              <span className="segmented-control__active-indicator" aria-hidden="true" />
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`lyrics-sidebar-panel-${tab}`}
                  id={`lyrics-sidebar-tab-${tab}`}
                  className={cn(
                    "segmented-control__item lyrics-sidebar-tab control-focus relative flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition",
                    activeTab === tab
                      ? "app-text-primary"
                      : "app-text-subtle"
                  )}
                  data-selected={activeTab === tab ? "true" : "false"}
                  onClick={() => onTabChange(tab)}
                  onKeyDown={(event) => onTabKeyDown(event, tab)}
                  tabIndex={activeTab === tab ? 0 : -1}
                  data-testid={`lyrics-sidebar-tab-${tab}`}
                >
                  {tabIcon(tab, "size-3.5")}
                  <span className="truncate">{tabLabel(copy, tab)}</span>
                </button>
              ))}
            </div>
            {mobileDrawer ? (
              <SidebarIconButton
                label={copy.closeDrawer}
                testId="lyrics-sidebar-close-drawer"
                onClick={onCloseDrawer}
                icon={<X className="size-4" />}
                buttonRef={closeDrawerButtonRef}
              />
            ) : null}
          </header>

          {feedback ? (
            <div
              className="status-info mx-2 mt-2 flex shrink-0 items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] leading-relaxed"
              role="status"
              aria-live="polite"
              data-testid="lyrics-operation-feedback"
            >
              <span className="min-w-0 flex-1">{feedback.message}</span>
              {feedback.canUndo ? (
                <button
                  type="button"
                  className="control-focus shrink-0 rounded px-1 font-semibold underline underline-offset-2"
                  onClick={onUndo}
                >
                  {copy.undoNow}
                </button>
              ) : null}
            </div>
          ) : null}

          <div
            className="min-h-0 flex-1 overflow-hidden"
            data-testid="lyrics-sidebar-panels"
          >
            <div
              ref={viewportRef}
              tabIndex={-1}
              className="relative h-full min-h-0 overflow-hidden focus:outline-none"
              data-testid="lyrics-translation-page-viewport"
              data-sidebar-page={activePage}
              data-translation-page={aiPanel ? "ai" : "home"}
              data-reduced-motion={reduceMotion ? "true" : "false"}
            >
              <SidebarDeckPage
                page="cleanup"
                activePage={activePage}
                transitionFrom={visibleTransitionFrom}
                reducedMotion={reduceMotion}
                id="lyrics-sidebar-panel-cleanup"
                labelledBy="lyrics-sidebar-tab-cleanup"
                testId="lyrics-sidebar-panel-cleanup"
                className="overflow-x-hidden overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]"
                onEntered={focusEnteredPage}
              >
                <CleanupPanel {...props} />
              </SidebarDeckPage>
              <SidebarDeckPage
                page="translation"
                activePage={activePage}
                transitionFrom={visibleTransitionFrom}
                reducedMotion={reduceMotion}
                id={!aiPanel ? "lyrics-sidebar-panel-translation" : undefined}
                labelledBy="lyrics-sidebar-tab-translation"
                testId="lyrics-translation-home-page"
                className="overflow-x-hidden overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]"
                onEntered={focusEnteredPage}
              >
                <TranslationPanel {...props} aiButtonRef={aiButtonRef} />
              </SidebarDeckPage>
              <SidebarDeckPage
                page="ai"
                activePage={activePage}
                transitionFrom={visibleTransitionFrom}
                reducedMotion={reduceMotion}
                id={aiPanel ? "lyrics-sidebar-panel-translation" : undefined}
                labelledBy="lyrics-sidebar-tab-translation"
                testId={renderedAiPanel ? "lyrics-translation-ai-page" : undefined}
                className="overflow-hidden"
                pageRef={aiPageRef}
                onEntered={focusEnteredPage}
              >
                {renderedAiPanel}
              </SidebarDeckPage>
            </div>
          </div>
      </div>
    </aside>
  );
}

function SidebarDeckPage({
  page,
  activePage,
  transitionFrom,
  reducedMotion,
  id,
  labelledBy,
  testId,
  className,
  pageRef,
  onEntered,
  children
}: {
  page: LyricsSidebarPage;
  activePage: LyricsSidebarPage;
  transitionFrom: LyricsSidebarPage | null;
  reducedMotion: boolean;
  id?: string;
  labelledBy: string;
  testId?: string;
  className: string;
  pageRef?: Ref<HTMLElement>;
  onEntered: (page: LyricsSidebarPage) => void;
  children: ReactNode;
}) {
  const active = page === activePage;
  const exiting = page === transitionFrom;
  const visible = active || exiting;
  const pageOffset = SIDEBAR_PAGE_INDEX[page] - SIDEBAR_PAGE_INDEX[activePage];

  return (
    <motion.section
      ref={pageRef}
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      aria-hidden={active ? undefined : true}
      inert={active ? undefined : true}
      hidden={!visible}
      initial={false}
      animate={{
        opacity: reducedMotion ? (active ? 1 : 0) : (visible ? 1 : 0),
        x: reducedMotion
          ? "0%"
          : pageOffset < 0
            ? "-100%"
            : pageOffset > 0
              ? "100%"
              : "0%"
      }}
      transition={reducedMotion ? reducedMotionTransition : sidebarPageTransition}
      onAnimationComplete={() => {
        if (active) onEntered(page);
      }}
      className={cn(
        "absolute inset-0 h-full min-h-0",
        className
      )}
      data-lyrics-sidebar-page={page}
      data-testid={testId}
      data-page-active={active ? "true" : "false"}
      style={{
        pointerEvents: active ? "auto" : "none",
        zIndex: active ? 2 : exiting ? 1 : 0
      }}
    >
      {children}
    </motion.section>
  );
}

function CleanupPanel({
  copy,
  activeEditor,
  activeText,
  selection,
  lyrics,
  translationText,
  translationEnabled,
  onBlankCleanup,
  onCleanPaste,
  onStripLrc,
  onMergeSelectedLines,
  onRemoveParagraphTags
}: LyricsSidebarProps) {
  const [synchronized, setSynchronized] = useState(false);
  const [showLrcPreview, setShowLrcPreview] = useState(false);
  const [showTagPreview, setShowTagPreview] = useState(false);
  const [showRemoveAllPreview, setShowRemoveAllPreview] = useState(false);
  const synchronizedActive = synchronized && translationEnabled;

  useEffect(() => {
    if (!translationEnabled) setSynchronized(false);
  }, [translationEnabled]);

  const scope = resolveLyricsTextScope(activeText, selection);
  const selectedLineCount = scope.hasSelection ? scope.endLine - scope.startLine + 1 : 0;
  const lrcPreview = useMemo(
    () => stripLrcTimeline(activeText, selection),
    [activeText, selection]
  );
  const tags = useMemo(
    () => previewParagraphTags(activeText, selection),
    [activeText, selection]
  );
  const cleanupCount = (lrcPreview.stats.timestamps ?? 0) + (lrcPreview.stats.metadata ?? 0);
  const activeLabel = activeEditor === "translation" ? copy.translation : copy.original;
  const scopeSummary = formatLyricsWorkspaceCopy(
    scope.hasSelection ? copy.selectedLinesScope : copy.activeColumnScope,
    {
      label: activeLabel,
      start: scope.startLine,
      end: scope.endLine
    }
  );
  const synchronizedScopeSummary = scope.hasSelection
    ? formatLyricsWorkspaceCopy(copy.synchronizedScope, {
        start: scope.startLine,
        end: scope.endLine
      })
    : formatLyricsWorkspaceCopy(copy.activeColumnScope, {
        label: `${copy.original}/${copy.translation}`
      });
  const removeAllCount = synchronizedActive
    ? cleanSynchronizedBlankRows({
        lyrics,
        translationText,
        mode: "all",
        lineRange: scope.hasSelection
          ? { startLine: scope.startLine, endLine: scope.endLine }
          : undefined
      }).removedRows
    : removeAllBlankLines(activeText, selection).stats.removedLines ?? 0;
  const removeAllScope = synchronizedActive ? synchronizedScopeSummary : scopeSummary;

  return (
    <div className="grid gap-3">
      <div
        className="lyrics-sidebar-context"
        data-testid="lyrics-cleanup-context"
      >
        <div className="flex min-w-0 items-center gap-2 px-0.5">
          <span className="app-text-subtle shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em]">
            {copy.scopeHeading}
          </span>
          <strong
            className="app-text-primary min-w-0 flex-1 truncate text-right text-xs font-semibold"
            data-testid="lyrics-cleanup-scope-summary"
            title={synchronizedActive ? synchronizedScopeSummary : scopeSummary}
          >
            {synchronizedActive ? synchronizedScopeSummary : scopeSummary}
          </strong>
        </div>
        <div
          role="group"
          aria-label={copy.scopeHeading}
          className="segmented-control lyrics-sidebar-choice-grid grid grid-cols-2"
          style={{
            "--segmented-count": 2,
            "--segmented-active-translate": synchronizedActive ? "100%" : "0%"
          } as CSSProperties}
        >
          <span className="segmented-control__active-indicator" aria-hidden="true" />
          <ChoiceButton
            selected={!synchronizedActive}
            onClick={() => setSynchronized(false)}
            label={copy.activeColumn}
            testId="lyrics-cleanup-scope-active"
          />
          <ChoiceButton
            selected={synchronizedActive}
            onClick={() => setSynchronized(true)}
            label={copy.alignedColumns}
            testId="lyrics-cleanup-scope-synchronized"
            disabled={!translationEnabled}
          />
        </div>
        {synchronizedActive ? (
          <p className="app-text-subtle px-0.5 text-[10px] leading-4">{copy.alignedColumnsHint}</p>
        ) : null}
      </div>

      <PanelSection title={copy.commonCleanupHeading} testId="lyrics-cleanup-section-common">
        <OperationGroup title={copy.blankLinesHeading}>
          <OperationItem>
            <ToolButton
              label={copy.trimBlankLines}
              onClick={() => onBlankCleanup("trim", synchronizedActive)}
              testId="lyrics-cleanup-blank-trim"
            />
          </OperationItem>
          <OperationItem>
            <ToolButton
              label={copy.collapseBlankLines}
              onClick={() => onBlankCleanup("collapse", synchronizedActive)}
              testId="lyrics-cleanup-blank-collapse"
            />
          </OperationItem>
          <OperationItem>
            <ToolButton
              label={copy.removeBlankLines}
              onClick={() => setShowRemoveAllPreview((value) => !value)}
              testId="lyrics-cleanup-blank-all-preview"
              danger
            />
            {showRemoveAllPreview ? (
              <PreviewBox testId="lyrics-cleanup-blank-all-preview-result">
                <p>{formatLyricsWorkspaceCopy(copy.removeBlankLinesPreview, {
                  count: removeAllCount,
                  scope: removeAllScope
                })}</p>
                <ToolButton
                  label={copy.confirmRemoveBlankLines}
                  onClick={() => {
                    onBlankCleanup("all", synchronizedActive);
                    setShowRemoveAllPreview(false);
                  }}
                  disabled={removeAllCount === 0}
                  testId="lyrics-cleanup-blank-all"
                  danger
                />
              </PreviewBox>
            ) : null}
          </OperationItem>
        </OperationGroup>

        <OperationGroup testId="lyrics-cleanup-section-paste">
          <OperationItem>
            <ToolButton
              label={copy.cleanPaste}
              description={copy.cleanPasteHint}
              onClick={onCleanPaste}
              testId="lyrics-cleanup-paste"
            />
          </OperationItem>
        </OperationGroup>
      </PanelSection>

      <details className="lyrics-sidebar-more" data-testid="lyrics-cleanup-more">
        <summary
          className="control-focus lyrics-sidebar-more__summary"
          data-testid="lyrics-cleanup-more-summary"
        >
          <span>{copy.moreCleanupHeading}</span>
          <ChevronDown className="lyrics-sidebar-more__chevron size-4" aria-hidden="true" />
        </summary>
        <div className="lyrics-sidebar-more__content">
          <OperationGroup title={copy.lrcHeading} testId="lyrics-cleanup-section-lrc">
            <OperationItem>
              <ToolButton
                label={copy.previewLrc}
                onClick={() => setShowLrcPreview((value) => !value)}
                testId="lyrics-cleanup-lrc-preview"
              />
              {showLrcPreview ? (
                <PreviewBox testId="lyrics-cleanup-lrc-preview-result">
                  <p>{formatLyricsWorkspaceCopy(copy.lrcPreview, {
                    timestamps: lrcPreview.stats.timestamps ?? 0,
                    metadata: lrcPreview.stats.metadata ?? 0
                  })}</p>
                  <ToolButton
                    label={copy.applyLrc}
                    onClick={onStripLrc}
                    disabled={cleanupCount === 0}
                    testId="lyrics-cleanup-lrc-apply"
                  />
                </PreviewBox>
              ) : null}
            </OperationItem>
          </OperationGroup>

          <OperationGroup title={copy.mergeHeading} testId="lyrics-cleanup-section-merge">
            <OperationItem>
              <ToolButton
                label={selectedLineCount >= 2
                  ? formatLyricsWorkspaceCopy(copy.mergeSelectedLines, { count: selectedLineCount })
                  : copy.mergeHeading}
                description={selectedLineCount < 2 ? copy.mergeSelectionHint : undefined}
                onClick={onMergeSelectedLines}
                disabled={selectedLineCount < 2}
                testId="lyrics-merge-selected"
              />
            </OperationItem>
          </OperationGroup>

          <OperationGroup title={copy.tagsHeading} testId="lyrics-cleanup-section-tags">
            <OperationItem>
              <ToolButton
                label={copy.previewTags}
                onClick={() => setShowTagPreview((value) => !value)}
                testId="lyrics-tags-preview"
              />
              {showTagPreview ? (
                <PreviewBox testId="lyrics-tags-preview-result">
                  {tags.length > 0 ? (
                    <>
                      <ul className="grid gap-1 font-mono text-[10px]">
                        {tags.slice(0, 8).map((tag) => <li key={`${tag.line}-${tag.text}`}>{tag.line}: {tag.text}</li>)}
                      </ul>
                      <ToolButton
                        label={formatLyricsWorkspaceCopy(copy.removeTags, { count: tags.length })}
                        onClick={onRemoveParagraphTags}
                        testId="lyrics-tags-apply"
                        danger
                      />
                    </>
                  ) : <p>{copy.noTags}</p>}
                </PreviewBox>
              ) : null}
            </OperationItem>
          </OperationGroup>
        </div>
      </details>
    </div>
  );
}

function TranslationPanel({
  copy,
  locale,
  lyrics,
  translationText,
  translationEnabled,
  themeColor,
  t,
  isAITranslating,
  showAiTranslate,
  onTranslationEnabledChange,
  onAITranslate,
  onSplitAlternatingLyrics,
  onFormatTranslation,
  onSwapColumns,
  aiButtonRef
}: LyricsSidebarProps & { aiButtonRef: Ref<HTMLButtonElement> }) {
  const [showSplitPreview, setShowSplitPreview] = useState(false);
  const [showSwapPreview, setShowSwapPreview] = useState(false);
  const split = useMemo(() => splitAlternatingLyrics(lyrics, locale), [locale, lyrics]);
  const aiCopy = getAIUiCopy(locale);
  const splitOriginalLines = countRows(split.lyrics);
  const splitTranslationLines = countRows(split.translationText);

  return (
    <div className="grid gap-3">
      <section
        className="lyrics-sidebar-primary"
        data-testid="lyrics-translation-primary"
      >
        <p className="app-text-subtle px-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]">
          {copy.translationHeading}
        </p>
        <ToggleRow
          label={t("enableTranslation")}
          checked={translationEnabled}
          onChange={onTranslationEnabledChange}
          size="sm"
          testId="translation-toggle"
          className="lyrics-sidebar-primary__toggle"
        />

        {showAiTranslate ? (
          <div className="rounded-md" data-testid="lyrics-ai-entry">
            <AiTranslateButton
              buttonRef={aiButtonRef}
              label={isAITranslating ? aiCopy.translating : aiCopy.aiTranslate}
              loading={isAITranslating}
              themeColor={themeColor}
              onClick={onAITranslate}
            />
          </div>
        ) : null}
      </section>

      <PanelSection title={copy.columnToolsHeading} testId="lyrics-translation-column-tools">
        <OperationGroup testId="lyrics-translation-section-split">
          <OperationItem>
            <ToolButton
              label={copy.splitPreview}
              onClick={() => setShowSplitPreview((value) => !value)}
              testId="lyrics-split-preview"
            />
            {showSplitPreview ? (
              <PreviewBox testId="lyrics-split-preview-result">
                <p>{formatLyricsWorkspaceCopy(copy.splitSummary, {
                  original: splitOriginalLines,
                  translation: splitTranslationLines
                })}</p>
                <ToolButton
                  label={copy.splitApply}
                  onClick={() => onSplitAlternatingLyrics(split.lyrics, split.translationText)}
                  disabled={!split.lyrics && !split.translationText}
                  testId="lyrics-split-apply"
                />
              </PreviewBox>
            ) : null}
          </OperationItem>
        </OperationGroup>

        <OperationGroup testId="lyrics-translation-section-format">
          <OperationItem>
            <ToolButton
              label={copy.formatTranslation}
              onClick={() => onFormatTranslation(formatChineseTranslation(translationText))}
              disabled={!translationText}
              testId="lyrics-format-translation"
            />
          </OperationItem>
        </OperationGroup>

        <OperationGroup testId="lyrics-translation-section-swap">
          <OperationItem>
            <ToolButton
              label={copy.swapPreview}
              onClick={() => setShowSwapPreview((value) => !value)}
              disabled={!translationText}
              testId="lyrics-swap-preview"
              danger
            />
            {showSwapPreview ? (
              <PreviewBox testId="lyrics-swap-preview-result">
                <p>{copy.swapSummary}</p>
                <ToolButton
                  label={copy.swapApply}
                  onClick={onSwapColumns}
                  testId="lyrics-swap-apply"
                  danger
                />
              </PreviewBox>
            ) : null}
          </OperationItem>
        </OperationGroup>
      </PanelSection>
    </div>
  );
}

function PanelSection({
  title,
  children,
  description,
  testId
}: {
  title: string;
  children: ReactNode;
  description?: ReactNode;
  testId?: string;
}) {
  return (
    <Section
      title={title}
      description={description}
      variant="plain"
      className="lyrics-sidebar-section"
      contentClassName="gap-2.5"
      testId={testId}
    >
      {children}
    </Section>
  );
}

function PreviewBox({
  children,
  testId
}: {
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="status-info grid gap-2.5 rounded-lg border p-3 text-xs leading-relaxed" data-testid={testId}>
      {children}
    </div>
  );
}

function OperationGroup({
  title,
  children,
  testId
}: {
  title?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="lyrics-sidebar-operation-group" data-testid={testId}>
      {title ? (
        <p className="app-text-subtle px-1 text-[10px] font-semibold uppercase tracking-[0.08em]">
          {title}
        </p>
      ) : null}
      <div className="lyrics-sidebar-operation-list">{children}</div>
    </div>
  );
}

function OperationItem({ children }: { children: ReactNode }) {
  return <div className="lyrics-sidebar-operation">{children}</div>;
}

function ChoiceButton({
  label,
  selected,
  onClick,
  testId,
  disabled = false
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "segmented-control__item control-focus control-disabled relative z-[2] h-8 min-w-0 rounded-lg px-2 text-[11px] font-semibold",
        selected && "app-text-primary"
      )}
      aria-pressed={selected}
      data-selected={selected ? "true" : "false"}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

const ToolButton = function ToolButton({
  label,
  description,
  onClick,
  testId,
  disabled = false,
  danger = false,
  ref
}: {
  label: string;
  description?: string;
  onClick: () => void;
  testId: string;
  disabled?: boolean;
  danger?: boolean;
  ref?: (node: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "control-surface lyrics-sidebar-action control-focus control-disabled flex min-h-9 w-full items-start rounded-lg px-2.5 py-2 text-left text-[13px] font-medium leading-5",
        danger && "lyrics-sidebar-action--danger"
      )}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      <span className="min-w-0 flex-1">
        <span className="app-text-primary block">{label}</span>
        {description ? (
          <span className="app-text-subtle mt-0.5 block text-[10px] font-normal leading-4">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
};

function SidebarIconButton({
  label,
  icon,
  onClick,
  testId,
  active = false,
  badge = 0,
  buttonRef
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  testId?: string;
  active?: boolean;
  badge?: number;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={cn(
        "app-button control-focus relative flex size-9 items-center justify-center rounded-md",
        active && "border-[var(--control-selected-border)] bg-[rgb(var(--button-bg-hover))]"
      )}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-testid={testId}
    >
      {icon}
      {badge > 0 ? (
        <span className="absolute right-0.5 top-0.5 flex min-h-3 min-w-3 items-center justify-center rounded-full bg-[var(--control-focus-border)] px-0.5 text-[8px] font-bold text-white">
          {Math.min(9, badge)}
        </span>
      ) : null}
    </button>
  );
}

function tabLabel(copy: LyricsWorkspaceCopy, tab: LyricsSidebarTab) {
  if (tab === "cleanup") return copy.cleanupTab;
  return copy.translationTab;
}

function tabIcon(tab: LyricsSidebarTab, className = "size-4") {
  if (tab === "cleanup") return <Eraser className={className} />;
  return <Languages className={className} />;
}

function countRows(text: string) {
  return text ? text.split(/\r\n?|\n/u).length : 0;
}
