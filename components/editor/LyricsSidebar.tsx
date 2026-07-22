"use client";

import { motion } from "framer-motion";
import {
  Eraser,
  Languages,
  X
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
  type ReactNode,
  useEffect,
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
  motionDurations,
  motionEasings,
  reducedMotionTransition
} from "@/lib/motion/tokens";
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
  collapsed: boolean;
  mobileDrawer: boolean;
  feedback: { message: string; canUndo: boolean } | null;
  focusIntent: LyricsCommandIntent | null;
  isAITranslating: boolean;
  showAiTranslate: boolean;
  aiPanel?: ReactNode;
  onTabChange: (tab: LyricsSidebarTab) => void;
  onOpenTab: (tab: LyricsSidebarTab, intent?: LyricsCommandIntent) => void;
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
  onSplitAlternatingLyrics: (lyrics: string, translationText: string) => void;
  onFormatTranslation: (translationText: string) => void;
  onSwapColumns: () => void;
};

const TABS: LyricsSidebarTab[] = ["cleanup", "translation"];

export function LyricsSidebar(props: LyricsSidebarProps) {
  const {
    copy,
    activeTab,
    open,
    collapsed,
    mobileDrawer,
    feedback,
    focusIntent,
    onTabChange,
    onOpenTab,
    onCloseDrawer,
    onIntentHandled,
    onUndo
  } = props;
  const reduceMotion = useAppReducedMotion();
  const intentTargets = useRef<Partial<Record<LyricsCommandIntent, HTMLElement | null>>>({});
  const closeDrawerButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingCollapsedTabFocusRef = useRef<LyricsSidebarTab | null>(null);
  const drawerOpenRef = useRef(false);
  const sidebarContentTransition = reduceMotion
    ? reducedMotionTransition
    : { duration: motionDurations.slow, ease: motionEasings.emphasized };

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
    if (!open || !focusIntent || collapsed) return;
    const frame = window.requestAnimationFrame(() => {
      intentTargets.current[focusIntent]?.focus({ preventScroll: true });
      onIntentHandled();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, collapsed, focusIntent, onIntentHandled, open]);

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

  function openCollapsedTab(tab: LyricsSidebarTab) {
    pendingCollapsedTabFocusRef.current = tab;
    onOpenTab(tab);
  }

  function focusPendingCollapsedTab() {
    const pendingTab = pendingCollapsedTabFocusRef.current;
    if (!open || collapsed || !pendingTab) return;
    const tab = document.getElementById(`lyrics-sidebar-tab-${pendingTab}`);
    if (!(tab instanceof HTMLButtonElement)) return;
    tab.focus({ preventScroll: true });
    if (document.activeElement === tab) pendingCollapsedTabFocusRef.current = null;
  }

  function onDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!mobileDrawer) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCloseDrawer();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
    )].filter((node) => !node.closest("[hidden]") && node.getClientRects().length > 0);
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
        collapsed && "lyrics-sidebar--collapsed",
        mobileDrawer && "lyrics-sidebar--drawer"
      )}
      data-testid="lyrics-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      data-mobile-drawer={mobileDrawer ? "true" : "false"}
      data-active-tab={activeTab}
    >
      <div className="relative h-full min-h-0">
        <motion.div
          initial={false}
          animate={
            collapsed
              ? { opacity: 1, x: 0, visibility: "visible" }
              : { opacity: 0, x: 18, transitionEnd: { visibility: "hidden" } }
          }
          transition={sidebarContentTransition}
          aria-hidden={!collapsed}
          inert={!collapsed ? true : undefined}
          className="lyrics-sidebar-motion-layer absolute inset-0 flex h-full min-h-0 flex-col items-center gap-2 p-2"
          data-testid="lyrics-sidebar-collapsed-layer"
          data-active={collapsed ? "true" : "false"}
          style={{ pointerEvents: collapsed ? "auto" : "none" }}
        >
          <nav className="flex flex-col gap-2" aria-label={copy.sidebar}>
            {TABS.map((tab) => (
              <SidebarIconButton
                key={tab}
                label={tabLabel(copy, tab)}
                testId={collapsed ? `lyrics-sidebar-tab-${tab}` : undefined}
                onClick={() => openCollapsedTab(tab)}
                active={activeTab === tab}
                icon={tabIcon(tab)}
              />
            ))}
          </nav>
        </motion.div>

        <motion.div
          initial={false}
          animate={
            collapsed
              ? { opacity: 0, x: 24, transitionEnd: { visibility: "hidden" } }
              : { opacity: 1, x: 0, visibility: "visible" }
          }
          transition={sidebarContentTransition}
          onAnimationComplete={focusPendingCollapsedTab}
          aria-hidden={collapsed}
          inert={collapsed ? true : undefined}
          className="lyrics-sidebar-motion-layer absolute inset-0 flex h-full min-h-0 flex-col"
          data-testid="lyrics-sidebar-expanded-layer"
          data-active={collapsed ? "false" : "true"}
          style={{ pointerEvents: collapsed ? "none" : "auto" }}
        >
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
                  tabIndex={!collapsed && activeTab === tab ? 0 : -1}
                  data-testid={!collapsed ? `lyrics-sidebar-tab-${tab}` : undefined}
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
            <SidebarPanel tab="cleanup" activeTab={activeTab}>
              <CleanupPanel {...props} />
            </SidebarPanel>
            <SidebarPanel tab="translation" activeTab={activeTab}>
              <TranslationPanel
                {...props}
                aiIntentRef={(node) => { intentTargets.current.ai = node; }}
              />
            </SidebarPanel>
          </div>
        </motion.div>
      </div>
    </aside>
  );
}

function SidebarPanel({
  tab,
  activeTab,
  children
}: {
  tab: LyricsSidebarTab;
  activeTab: LyricsSidebarTab;
  children: ReactNode;
}) {
  return (
    <section
      id={`lyrics-sidebar-panel-${tab}`}
      role="tabpanel"
      aria-labelledby={`lyrics-sidebar-tab-${tab}`}
      hidden={activeTab !== tab}
      className="lyrics-sidebar-panel h-full min-h-0 overflow-y-auto overscroll-contain p-3"
      data-testid={`lyrics-sidebar-panel-${tab}`}
    >
      {children}
    </section>
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
    : copy.alignedColumns;
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
    <div className="grid gap-0">
      <PanelSection
        title={copy.scopeHeading}
        description={(
          <span data-testid="lyrics-cleanup-scope-summary">
            {synchronizedActive ? synchronizedScopeSummary : scopeSummary}
          </span>
        )}
      >
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
        {synchronizedActive ? <p className="app-text-subtle text-xs leading-relaxed">{copy.alignedColumnsHint}</p> : null}
      </PanelSection>

      <PanelSection title={copy.blankLinesHeading}>
        <div className="grid gap-1.5">
          <ToolButton
            label={copy.trimBlankLines}
            onClick={() => onBlankCleanup("trim", synchronizedActive)}
            testId="lyrics-cleanup-blank-trim"
          />
          <ToolButton
            label={copy.collapseBlankLines}
            onClick={() => onBlankCleanup("collapse", synchronizedActive)}
            testId="lyrics-cleanup-blank-collapse"
          />
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
        </div>
      </PanelSection>

      <PanelSection title={copy.cleanPaste} testId="lyrics-cleanup-section-paste">
        <p className="app-text-subtle text-xs leading-relaxed">{copy.cleanPasteHint}</p>
        <ToolButton
          label={copy.cleanPaste}
          onClick={onCleanPaste}
          testId="lyrics-cleanup-paste"
        />
      </PanelSection>

      <PanelSection title={copy.lrcHeading} testId="lyrics-cleanup-section-lrc">
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
      </PanelSection>

      <PanelSection title={copy.mergeHeading} testId="lyrics-cleanup-section-merge">
        <ToolButton
          label={selectedLineCount >= 2
            ? formatLyricsWorkspaceCopy(copy.mergeSelectedLines, { count: selectedLineCount })
            : copy.mergeSelectionHint}
          onClick={onMergeSelectedLines}
          disabled={selectedLineCount < 2}
          testId="lyrics-merge-selected"
        />
      </PanelSection>

      <PanelSection title={copy.tagsHeading} testId="lyrics-cleanup-section-tags">
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
      </PanelSection>
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
  aiPanel,
  onTranslationEnabledChange,
  onAITranslate,
  onSplitAlternatingLyrics,
  onFormatTranslation,
  onSwapColumns,
  aiIntentRef
}: LyricsSidebarProps & {
  aiIntentRef: (node: HTMLDivElement | null) => void;
}) {
  const [showSplitPreview, setShowSplitPreview] = useState(false);
  const [showSwapPreview, setShowSwapPreview] = useState(false);
  const split = useMemo(() => splitAlternatingLyrics(lyrics, locale), [locale, lyrics]);
  const aiCopy = getAIUiCopy(locale);
  const splitOriginalLines = countRows(split.lyrics);
  const splitTranslationLines = countRows(split.translationText);

  return (
    <div className="grid gap-0">
      <PanelSection title={copy.translationHeading}>
        <ToggleRow
          label={t("enableTranslation")}
          checked={translationEnabled}
          onChange={onTranslationEnabledChange}
          size="sm"
          testId="translation-toggle"
        />

        {showAiTranslate ? (
          <div ref={aiIntentRef} tabIndex={-1} className="control-focus rounded-md" data-testid="lyrics-ai-entry">
            <AiTranslateButton
              label={isAITranslating ? aiCopy.translating : aiCopy.aiTranslate}
              loading={isAITranslating}
              themeColor={themeColor}
              onClick={onAITranslate}
            />
          </div>
        ) : null}
        <div
          hidden={!aiPanel}
          className="min-w-0 rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--input-bg))] p-3"
          data-testid="lyrics-ai-panel-boundary"
        >
          {aiPanel}
        </div>
      </PanelSection>

      <PanelSection title={t("splitAlternatingLyrics")} testId="lyrics-translation-section-split">
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
      </PanelSection>

      <PanelSection title={copy.formatTranslation} testId="lyrics-translation-section-format">
        <ToolButton
          label={copy.formatTranslation}
          onClick={() => onFormatTranslation(formatChineseTranslation(translationText))}
          disabled={!translationText}
          testId="lyrics-format-translation"
        />
      </PanelSection>

      <PanelSection title={copy.swapPreview} testId="lyrics-translation-section-swap">
        <ToolButton
          label={copy.swapPreview}
          onClick={() => setShowSwapPreview((value) => !value)}
          disabled={!translationText}
          testId="lyrics-swap-preview"
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
        "segmented-control__item control-focus control-disabled relative z-[2] h-9 min-w-0 rounded-lg px-2 text-xs font-semibold",
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
  onClick,
  testId,
  disabled = false,
  danger = false,
  ref
}: {
  label: string;
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
        "control-surface lyrics-sidebar-action control-focus control-disabled flex min-h-9 w-full items-center rounded-lg px-3 py-2 text-left text-[13px] font-medium leading-5",
        danger && "lyrics-sidebar-action--danger"
      )}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      {label}
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
