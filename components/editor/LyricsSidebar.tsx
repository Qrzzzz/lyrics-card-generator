"use client";

import {
  Database,
  Eraser,
  Languages,
  ListChecks,
  Music2,
  PanelRightClose,
  PanelRightOpen,
  X
} from "lucide-react";
import {
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
import {
  formatLyricsWorkspaceCopy,
  type LyricsWorkspaceCopy
} from "@/components/editor/lyrics-workspace-copy";
import { ToggleRow } from "@/components/ui/controls";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { createT } from "@/lib/i18n";
import { formatChineseTranslation, splitAlternatingLyrics } from "@/lib/lyric-format";
import type { ExportLyricLineStatus } from "@/lib/lyrics-document";
import {
  cleanSynchronizedBlankRows,
  countFindMatches,
  previewParagraphTags,
  removeAllBlankLines,
  resolveLyricsTextScope,
  stripLrcTimeline,
  type LyricsBlankMode,
  type LyricsDocumentAnalysis,
  type LyricsIssue,
  type LyricsSidebarTab,
  type LyricsTextSelection,
  type LyricsWorkbenchEditor
} from "@/lib/lyrics-workbench";
import type { Locale, SongInfo } from "@/lib/types";
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
  lineStatus: ExportLyricLineStatus;
  analysis: LyricsDocumentAnalysis;
  song: SongInfo;
  locale: Locale;
  themeColor: string;
  t: ReturnType<typeof createT>;
  open: boolean;
  collapsed: boolean;
  collapsible: boolean;
  mobileDrawer: boolean;
  feedback: { message: string; canUndo: boolean } | null;
  focusIntent: LyricsCommandIntent | null;
  isAITranslating: boolean;
  showAiTranslate: boolean;
  aiPanel?: ReactNode;
  lyricsFetchPanel?: ReactNode;
  onTabChange: (tab: LyricsSidebarTab) => void;
  onOpenTab: (tab: LyricsSidebarTab, intent?: LyricsCommandIntent) => void;
  onToggleCollapsed: () => void;
  onCloseDrawer: () => void;
  onIntentHandled: () => void;
  onUndo: () => void;
  onBlankCleanup: (mode: LyricsBlankMode, synchronized: boolean) => void;
  onCleanPaste: () => void;
  onStripLrc: () => void;
  onReplace: (query: string, replacement: string, matchCase: boolean) => void;
  onMergeSelectedLines: () => void;
  onRemoveParagraphTags: () => void;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onAITranslate: () => void;
  onSplitAlternatingLyrics: (lyrics: string, translationText: string) => void;
  onFormatTranslation: (translationText: string) => void;
  onSwapColumns: () => void;
  onLocate: (editor: LyricsWorkbenchEditor, line: number) => void;
};

const TABS: LyricsSidebarTab[] = ["cleanup", "translation", "review", "source"];

export function LyricsSidebar(props: LyricsSidebarProps) {
  const {
    copy,
    activeTab,
    open,
    collapsed,
    collapsible,
    mobileDrawer,
    lineStatus,
    analysis,
    lyricsFetchPanel,
    feedback,
    focusIntent,
    onTabChange,
    onOpenTab,
    onToggleCollapsed,
    onCloseDrawer,
    onIntentHandled,
    onUndo
  } = props;
  const intentTargets = useRef<Partial<Record<LyricsCommandIntent, HTMLElement | null>>>({});
  const closeDrawerButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerOpenRef = useRef(false);
  const reviewCount = analysis.issues.length + (analysis.lineDifference === 0 ? 0 : 1) + (lineStatus.isOverLimit ? 1 : 0);

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
    onOpenTab(tab);
    window.requestAnimationFrame(() => {
      document.getElementById(`lyrics-sidebar-tab-${tab}`)?.focus({ preventScroll: true });
    });
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
        "lyrics-sidebar app-text-muted h-full min-h-0 min-w-0 overflow-hidden bg-[rgb(var(--panel-bg))]",
        collapsed && "lyrics-sidebar--collapsed",
        mobileDrawer && "lyrics-sidebar--drawer"
      )}
      data-testid="lyrics-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      data-mobile-drawer={mobileDrawer ? "true" : "false"}
      data-active-tab={activeTab}
    >
      <div className={cn("h-full min-h-0", !collapsed && "flex flex-col")}>
        {collapsed ? (
          <div className="flex h-full min-h-0 flex-col items-center gap-2 p-2">
            <SidebarIconButton
              label={copy.expandSidebar}
              testId="lyrics-sidebar-collapse"
              onClick={onToggleCollapsed}
              icon={<PanelRightOpen className="size-4" />}
            />
            <div className="h-px w-7 bg-[rgb(var(--panel-border))]" aria-hidden="true" />
            <nav className="flex flex-col gap-2" aria-label={copy.sidebar}>
              {TABS.map((tab) => (
                <SidebarIconButton
                  key={tab}
                  label={tabLabel(copy, tab)}
                  testId={`lyrics-sidebar-tab-${tab}`}
                  onClick={() => openCollapsedTab(tab)}
                  active={activeTab === tab}
                  badge={tab === "review" ? reviewCount : tab === "source" && lyricsFetchPanel ? 1 : 0}
                  icon={tabIcon(tab)}
                />
              ))}
            </nav>
            <button
              type="button"
              className={cn(
                "mt-auto w-full rounded-md border px-1 py-2 text-center font-mono text-[10px] font-bold",
                lineStatus.isOverLimit ? "status-danger" : "status-idle"
              )}
              onClick={() => onOpenTab("review", "budget")}
              aria-label={`${copy.lineBudgetLabel}: ${lineStatus.totalLineCount}/${lineStatus.maxLineCount}`}
              data-testid="lyrics-sidebar-budget"
            >
              {lineStatus.totalLineCount}/{lineStatus.maxLineCount}
            </button>
          </div>
        ) : (
          <>
          <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[rgb(var(--panel-border))] px-2.5">
            <p className="app-text-primary min-w-0 flex-1 truncate text-xs font-semibold">{copy.sidebar}</p>
            {mobileDrawer ? (
              <SidebarIconButton
                label={copy.closeDrawer}
                testId="lyrics-sidebar-close-drawer"
                onClick={onCloseDrawer}
                icon={<X className="size-4" />}
                buttonRef={closeDrawerButtonRef}
              />
            ) : collapsible ? (
              <SidebarIconButton
                label={copy.collapseSidebar}
                testId="lyrics-sidebar-collapse"
                onClick={onToggleCollapsed}
                icon={<PanelRightClose className="size-4" />}
              />
            ) : null}
          </header>

          <div
            role="tablist"
            aria-label={copy.sidebar}
            className="grid shrink-0 grid-cols-4 gap-1 border-b border-[rgb(var(--panel-border))] p-1.5"
          >
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`lyrics-sidebar-panel-${tab}`}
                id={`lyrics-sidebar-tab-${tab}`}
                className={cn(
                  "control-focus relative flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-[10px] font-semibold transition",
                  activeTab === tab
                    ? "app-text-primary bg-[rgb(var(--button-bg-hover))]"
                    : "app-text-subtle hover:bg-[rgb(var(--button-bg))]"
                )}
                 onClick={() => onTabChange(tab)}
                 onKeyDown={(event) => onTabKeyDown(event, tab)}
                 tabIndex={activeTab === tab ? 0 : -1}
                 data-testid={`lyrics-sidebar-tab-${tab}`}
              >
                {tabIcon(tab, "size-3.5")}
                <span className="truncate">{tabLabel(copy, tab)}</span>
                {tab === "review" && reviewCount > 0 ? (
                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--control-focus-border)]" aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </div>

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
          </>
        )}

        <div
          className={cn("min-h-0 flex-1 overflow-hidden", collapsed && "hidden")}
          data-testid="lyrics-sidebar-panels"
        >
          <SidebarPanel tab="cleanup" activeTab={activeTab}>
            <CleanupPanel
              {...props}
              blankIntentRef={(node) => { intentTargets.current.blank = node; }}
              findIntentRef={(node) => { intentTargets.current.find = node; }}
            />
          </SidebarPanel>
          <SidebarPanel tab="translation" activeTab={activeTab}>
            <TranslationPanel
              {...props}
              aiIntentRef={(node) => { intentTargets.current.ai = node; }}
            />
          </SidebarPanel>
          <SidebarPanel tab="review" activeTab={activeTab}>
            <ReviewPanel
              {...props}
              budgetIntentRef={(node) => { intentTargets.current.budget = node; }}
            />
          </SidebarPanel>
          <SidebarPanel tab="source" activeTab={activeTab}>
            <SourcePanel {...props} />
          </SidebarPanel>
        </div>
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
      className="lyrics-sidebar-panel h-full min-h-0 overflow-y-auto overscroll-contain p-2.5"
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
  onReplace,
  onMergeSelectedLines,
  onRemoveParagraphTags,
  blankIntentRef,
  findIntentRef
}: LyricsSidebarProps & {
  blankIntentRef: (node: HTMLButtonElement | null) => void;
  findIntentRef: (node: HTMLInputElement | null) => void;
}) {
  const [synchronized, setSynchronized] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [showLrcPreview, setShowLrcPreview] = useState(false);
  const [showTagPreview, setShowTagPreview] = useState(false);
  const [showRemoveAllPreview, setShowRemoveAllPreview] = useState(false);
  const synchronizedActive = synchronized && translationEnabled;

  useEffect(() => {
    if (!translationEnabled) setSynchronized(false);
  }, [translationEnabled]);

  const scope = resolveLyricsTextScope(activeText, selection);
  const selectedLineCount = scope.hasSelection ? scope.endLine - scope.startLine + 1 : 0;
  const matchCount = countFindMatches(activeText, selection, query, matchCase);
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
    <div className="grid gap-3">
      <PanelHeading title={copy.cleanupHeading} />
      <PanelSection title={copy.scopeHeading}>
        <div className="grid grid-cols-2 gap-1">
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
        <p className="app-text-subtle text-[10px] leading-relaxed" data-testid="lyrics-cleanup-scope-summary">
          {synchronizedActive ? synchronizedScopeSummary : scopeSummary}
        </p>
        {synchronizedActive ? <p className="app-text-subtle text-[10px] leading-relaxed">{copy.alignedColumnsHint}</p> : null}
      </PanelSection>

      <PanelSection title={copy.blankLinesHeading}>
        <div className="grid gap-1.5">
          <ToolButton
            ref={blankIntentRef}
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

      <PanelSection title={copy.cleanPaste}>
        <p className="app-text-subtle text-[10px] leading-relaxed">{copy.cleanPasteHint}</p>
        <ToolButton
          label={copy.cleanPaste}
          onClick={onCleanPaste}
          testId="lyrics-cleanup-paste"
        />
      </PanelSection>

      <PanelSection title={copy.lrcHeading}>
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

      <PanelSection title={copy.findReplaceHeading}>
        <label className="grid gap-1 text-[10px] font-semibold">
          <span>{copy.findLabel}</span>
          <input
            ref={findIntentRef}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="field-shell control-focus h-9 rounded-md px-2 text-xs"
            data-testid="lyrics-find-input"
          />
        </label>
        <label className="grid gap-1 text-[10px] font-semibold">
          <span>{copy.replaceLabel}</span>
          <input
            value={replacement}
            onChange={(event) => setReplacement(event.currentTarget.value)}
            className="field-shell control-focus h-9 rounded-md px-2 text-xs"
            data-testid="lyrics-replace-input"
          />
        </label>
        <label className="app-text-subtle flex items-center gap-2 text-[10px]">
          <input
            type="checkbox"
            checked={matchCase}
            onChange={(event) => setMatchCase(event.currentTarget.checked)}
            className="control-focus"
          />
          {copy.matchCase}
        </label>
        <p className="app-text-subtle text-[10px]">
          {formatLyricsWorkspaceCopy(copy.matchCount, { count: matchCount })}
        </p>
        <ToolButton
          label={formatLyricsWorkspaceCopy(copy.replaceMatches, { count: matchCount })}
          onClick={() => onReplace(query, replacement, matchCase)}
          disabled={!query || matchCount === 0}
          testId="lyrics-replace-apply"
        />
      </PanelSection>

      <PanelSection title={copy.mergeHeading}>
        <ToolButton
          label={selectedLineCount >= 2
            ? formatLyricsWorkspaceCopy(copy.mergeSelectedLines, { count: selectedLineCount })
            : copy.mergeSelectionHint}
          onClick={onMergeSelectedLines}
          disabled={selectedLineCount < 2}
          testId="lyrics-merge-selected"
        />
      </PanelSection>

      <PanelSection title={copy.tagsHeading}>
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
  analysis,
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
  onLocate,
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
    <div className="grid gap-3">
      <PanelHeading title={copy.translationHeading} />
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
        className="min-w-0 rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--input-bg))] p-2"
        data-testid="lyrics-ai-panel-boundary"
      >
        {aiPanel}
      </div>

      <PanelSection title={t("splitAlternatingLyrics")}>
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

      <PanelSection title={copy.formatTranslation}>
        <ToolButton
          label={copy.formatTranslation}
          onClick={() => onFormatTranslation(formatChineseTranslation(translationText))}
          disabled={!translationText}
          testId="lyrics-format-translation"
        />
      </PanelSection>

      <PanelSection title={copy.swapPreview}>
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

      <PanelSection title={copy.alignmentHeading}>
        {analysis.lineDifference === 0 ? (
          <p className="status-success rounded-md border px-2.5 py-2 text-[11px]">{copy.alignmentOk}</p>
        ) : (
          <div className="status-info grid gap-2 rounded-md border px-2.5 py-2 text-[11px]">
            <p>{formatLyricsWorkspaceCopy(copy.alignmentMismatch, {
              count: Math.abs(analysis.lineDifference),
              line: analysis.firstUnpairedLine ?? 1
            })}</p>
            <ToolButton
              label={formatLyricsWorkspaceCopy(copy.locateLine, { line: analysis.firstUnpairedLine ?? 1 })}
              onClick={() => onLocate(
                analysis.lineDifference > 0 ? "lyrics" : "translation",
                analysis.firstUnpairedLine ?? 1
              )}
              testId="lyrics-alignment-locate"
            />
          </div>
        )}
      </PanelSection>
    </div>
  );
}

function ReviewPanel({
  copy,
  lineStatus,
  analysis,
  onLocate,
  budgetIntentRef
}: LyricsSidebarProps & {
  budgetIntentRef: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div className="grid gap-3">
      <PanelHeading title={copy.reviewHeading} />
      <div
        ref={budgetIntentRef}
        tabIndex={-1}
        className={cn(
          "control-focus rounded-md border px-3 py-2.5 text-xs leading-relaxed",
          lineStatus.isOverLimit ? "status-danger" : "status-idle"
        )}
        data-testid="lyrics-line-budget"
      >
        <p className="font-semibold">
          {lineStatus.originalLineCount} + {lineStatus.translationLineCount} = {lineStatus.totalLineCount} / {lineStatus.maxLineCount}
        </p>
        <p className="mt-1 text-[10px]">
          {formatLyricsWorkspaceCopy(
            lineStatus.isOverLimit ? copy.budgetExceeded : copy.budgetRemaining,
            { count: lineStatus.isOverLimit ? lineStatus.exceededLineCount : lineStatus.remainingLineCount }
          )}
        </p>
      </div>

      <PanelSection title={copy.alignmentHeading}>
        {analysis.lineDifference === 0 ? (
          <p className="app-text-subtle text-[11px]">{copy.alignmentOk}</p>
        ) : (
          <IssueButton
            label={formatLyricsWorkspaceCopy(copy.alignmentMismatch, {
              count: Math.abs(analysis.lineDifference),
              line: analysis.firstUnpairedLine ?? 1
            })}
            onClick={() => onLocate(
              analysis.lineDifference > 0 ? "lyrics" : "translation",
              analysis.firstUnpairedLine ?? 1
            )}
            testId="lyrics-review-alignment"
          />
        )}
      </PanelSection>

      <PanelSection title={copy.issueHeading}>
        {analysis.issues.length > 0 ? (
          <div className="grid gap-1.5">
            {analysis.issues.slice(0, 24).map((issue) => (
              <IssueButton
                key={issue.id}
                label={issueLabel(copy, issue)}
                excerpt={issue.excerpt}
                onClick={() => onLocate(issue.editor, issue.line)}
                testId="lyrics-review-issue"
              />
            ))}
          </div>
        ) : (
          <p className="app-text-subtle text-[11px] leading-relaxed">{copy.noIssues}</p>
        )}
      </PanelSection>
    </div>
  );
}

function SourcePanel({
  copy,
  song,
  t,
  lyricsFetchPanel
}: LyricsSidebarProps) {
  const source = song.source || "manual";
  return (
    <div className="grid gap-3">
      <PanelHeading title={copy.sourceHeading} />
      <section className="rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] p-2.5" aria-label={copy.currentSong}>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="control-surface relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md">
            {song.coverUrl || song.proxiedCoverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={song.proxiedCoverUrl || proxiedImageUrl(song.coverUrl)}
                alt=""
                className="absolute inset-0 size-full object-cover"
                crossOrigin="anonymous"
              />
            ) : <Music2 className="app-text-subtle size-4" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <p className="app-text-primary truncate text-xs font-semibold">{song.title || t("untitled")}</p>
            <p className="app-text-subtle mt-0.5 truncate text-[10px]">{song.artist || t("unknownArtist")}</p>
          </div>
        </div>
        <p className="app-text-subtle mt-2 text-[10px]">
          {formatLyricsWorkspaceCopy(copy.sourceStatus, { source })}
        </p>
      </section>
      <div
        className="min-w-0 rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--input-bg))] p-2"
        data-testid="lyrics-fetch-panel-boundary"
      >
        {lyricsFetchPanel ?? <p className="app-text-subtle text-[11px] leading-relaxed">{copy.noSourceTools}</p>}
      </div>
    </div>
  );
}

function PanelHeading({ title }: { title: string }) {
  return <h3 className="app-text-primary text-sm font-semibold">{title}</h3>;
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2 rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] p-2.5">
      <h4 className="app-text-primary text-[11px] font-semibold">{title}</h4>
      {children}
    </section>
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
    <div className="status-info grid gap-2 rounded-md border px-2.5 py-2 text-[10px] leading-relaxed" data-testid={testId}>
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
        "app-button control-focus min-h-9 rounded-md px-2 text-[10px] font-semibold disabled:opacity-35",
        selected && "border-[var(--control-selected-border)] bg-[rgb(var(--button-bg-hover))]"
      )}
      aria-pressed={selected}
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
        "app-button control-focus min-h-9 w-full rounded-md px-2.5 text-left text-[11px] font-semibold disabled:cursor-default disabled:opacity-35",
        danger && "hover:border-[rgb(var(--danger))]"
      )}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      {label}
    </button>
  );
};

function IssueButton({
  label,
  excerpt,
  onClick,
  testId
}: {
  label: string;
  excerpt?: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="app-button control-focus grid min-h-10 w-full gap-0.5 rounded-md px-2.5 py-2 text-left"
      onClick={onClick}
      data-testid={testId}
    >
      <span className="app-text-primary text-[10px] font-semibold leading-relaxed">{label}</span>
      {excerpt ? <span className="app-text-subtle truncate font-mono text-[9px]">{excerpt}</span> : null}
    </button>
  );
}

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
  testId: string;
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
  if (tab === "translation") return copy.translationTab;
  if (tab === "review") return copy.reviewTab;
  return copy.sourceTab;
}

function tabIcon(tab: LyricsSidebarTab, className = "size-4") {
  if (tab === "cleanup") return <Eraser className={className} />;
  if (tab === "translation") return <Languages className={className} />;
  if (tab === "review") return <ListChecks className={className} />;
  return <Database className={className} />;
}

function issueLabel(copy: LyricsWorkspaceCopy, issue: LyricsIssue) {
  const label = issue.editor === "translation" ? copy.translation : copy.original;
  const template = issue.kind === "long-line"
    ? copy.longLineIssue
    : issue.kind === "duplicate-line"
      ? copy.duplicateLineIssue
      : copy.invisibleIssue;
  return formatLyricsWorkspaceCopy(template, {
    label,
    line: issue.line,
    count: issue.count
  });
}

function countRows(text: string) {
  return text ? text.split(/\r\n?|\n/u).length : 0;
}
