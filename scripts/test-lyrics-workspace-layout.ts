import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  __internalLyricsWorkspaceLayout,
  resolveLyricsWorkspaceSplit
} from "../lib/lyrics-workspace-layout";

const {
  DEFAULT_EDITOR_RATIO,
  MIN_EDITOR_WIDTH,
  MIN_TOOLS_WIDTH,
  EXPANDED_GAP,
  MIN_SIDE_BY_SIDE_WIDTH
} = __internalLyricsWorkspaceLayout;

// Numeric layout tests cover the pure splitter, while later source contracts
// ensure components and CSS continue to consume the same fixed-column model.
const defaultSplit = resolveLyricsWorkspaceSplit(1220);
assert.equal(defaultSplit.usableWidth, 1212);
assert.equal(defaultSplit.editorWidth, 808, "the lyrics editor keeps two thirds of the usable width");
assert.equal(defaultSplit.toolsWidth, 404, "the tools default to their maximum one-third width");
assert.equal(defaultSplit.gap, 8, "the fixed columns retain a compact visual gutter");
assert.equal(defaultSplit.ratio, DEFAULT_EDITOR_RATIO, "the fixed desktop ratio is two thirds to one third");

const minimumSplit = resolveLyricsWorkspaceSplit(MIN_SIDE_BY_SIDE_WIDTH);
assert.ok(Math.abs(minimumSplit.editorWidth - MIN_EDITOR_WIDTH) < 0.001);
assert.ok(Math.abs(minimumSplit.toolsWidth - MIN_TOOLS_WIDTH) < 0.001);
assert.equal(
  minimumSplit.editorWidth + minimumSplit.toolsWidth + EXPANDED_GAP,
  MIN_SIDE_BY_SIDE_WIDTH,
  "minimum width constraints fit without horizontal overflow"
);

const editorStepsSource = readFileSync(resolve("components/editor/useEditorSteps.tsx"), "utf8");
const workspaceSource = readFileSync(resolve("components/editor/LyricsWorkspace.tsx"), "utf8");
const commandBarSource = readFileSync(resolve("components/editor/LyricsCommandBar.tsx"), "utf8");
const reviewMenuSource = readFileSync(resolve("components/editor/LyricsReviewMenu.tsx"), "utf8");
const fetchPanelSource = readFileSync(resolve("components/editor/LyricsFetchPanel.tsx"), "utf8");
const sidebarSource = readFileSync(resolve("components/editor/LyricsSidebar.tsx"), "utf8");
const sidebarPanelsSource = readFileSync(resolve("components/editor/LyricsSidebarPanels.tsx"), "utf8");
const sidebarNavigationSource = readFileSync(resolve("components/editor/hooks/useLyricsSidebarNavigation.ts"), "utf8");
const documentControllerSource = readFileSync(resolve("components/editor/hooks/useLyricsWorkspaceDocumentController.ts"), "utf8");
const viewportSessionSource = readFileSync(resolve("components/editor/hooks/useLyricsViewportSession.ts"), "utf8");
const aiTranslatePanelSource = readFileSync(resolve("components/lyrics/AiTranslatePanel.tsx"), "utf8");
const copySource = readFileSync(resolve("components/editor/lyrics-workspace-copy.ts"), "utf8");
const motionTokensSource = readFileSync(resolve("lib/motion/tokens.ts"), "utf8");
const workspaceSplitHookSource = readFileSync(resolve("components/editor/hooks/useLyricsWorkspaceSplit.ts"), "utf8");
const stepperSource = readFileSync(resolve("components/editor/SettingsStepper.tsx"), "utf8");
const globalsSource = readFileSync(resolve("app/globals.css"), "utf8");

assert.ok(
  editorStepsSource.includes('import { LyricsWorkspace } from "@/components/editor/LyricsWorkspace"') &&
    editorStepsSource.includes('useState<LyricsSidebarTab>("cleanup")') &&
    !editorStepsSource.includes("LyricInput") &&
    !editorStepsSource.includes("onSplitAlternatingLyrics") &&
    !editorStepsSource.includes("lyricsWorkspaceLayoutReducer") &&
    !editorStepsSource.includes("workspaceLayout={lyricsWorkspaceLayout}") &&
    !editorStepsSource.includes("onWorkspaceLayoutAction"),
  "step two uses LyricsWorkspace directly and keeps only active-tab state"
);
assert.ok(
  workspaceSource.includes("const splitStyle = sideBySide") &&
    workspaceSource.includes("gridTemplateColumns: `${split.geometry.editorWidth}px ${split.geometry.toolsWidth}px`") &&
    workspaceSource.includes("showSidebarToggle={!sideBySide}") &&
    !workspaceSource.includes("lyrics-workspace-resizer") &&
    !workspaceSource.includes('role="separator"') &&
    !workspaceSource.includes("sidebarCollapsed"),
  "the desktop split is fixed while only narrow layouts expose the drawer control"
);
assert.ok(
  workspaceSplitHookSource.includes("new ResizeObserver(update)") &&
    workspaceSplitHookSource.includes("window.matchMedia(LYRICS_WORKSPACE_DESKTOP_QUERY)") &&
    workspaceSplitHookSource.includes("resolveLyricsWorkspaceSplit(viewportWidth)") &&
    !workspaceSplitHookSource.includes("onRequestedRatioChange") &&
    !workspaceSplitHookSource.includes("separatorProps"),
  "the lyrics split observes its viewport without exposing resize interactions"
);
assert.ok(
  workspaceSource.includes('data-testid="lyrics-shared-scroll"') &&
    (workspaceSource.match(/overflow-y-auto/g)?.length ?? 0) === 1 &&
    workspaceSource.includes("<LyricsCommandBar"),
  "the two editors retain one shared vertical scroller beneath one compact command bar"
);
assert.ok(
  workspaceSource.includes("lyrics-workspace-surface") &&
    workspaceSource.includes("lyrics-document-editor") &&
    commandBarSource.includes("lyrics-command-button") &&
    sidebarPanelsSource.includes("control-surface lyrics-sidebar-action") &&
    sidebarPanelsSource.includes("<Section") &&
    globalsSource.includes(".lyrics-workspace-surface") &&
    globalsSource.includes(".lyrics-sidebar-tabs.segmented-control") &&
    globalsSource.includes(".lyrics-sidebar-section:first-child") &&
    !globalsSource.includes(".lyrics-sidebar-section--sticky") &&
    !sidebarPanelsSource.includes("sticky top-0"),
  "the workspace stays transparent while the sidebar reuses the settings control language without overlapping sticky content"
);
assert.ok(
  sidebarSource.includes('data-testid={`lyrics-sidebar-tab-${tab}`}') &&
    sidebarSource.includes("tabIndex={activeTab === tab ? 0 : -1}") &&
    !sidebarSource.includes("data-collapsed") &&
    !sidebarSource.includes("lyrics-sidebar-collapsed-layer") &&
    !sidebarSource.includes("lyrics-sidebar-expanded-layer") &&
    !sidebarSource.includes('data-testid="lyrics-sidebar-budget"') &&
    !sidebarPanelsSource.includes("<CollapsiblePanelSection") &&
    sidebarPanelsSource.includes('data-testid="lyrics-cleanup-context"') &&
    sidebarPanelsSource.includes('testId="lyrics-cleanup-section-common"') &&
    sidebarPanelsSource.includes('data-testid="lyrics-cleanup-more"') &&
    sidebarPanelsSource.includes('<details className="lyrics-sidebar-more"') &&
    sidebarPanelsSource.includes('testId="lyrics-cleanup-section-paste"') &&
    sidebarPanelsSource.includes('testId="lyrics-cleanup-section-lrc"'),
  "the always-open sidebar keeps stable tab navigation while concentrating low-frequency cleanup in one native disclosure"
);
assert.ok(
  sidebarPanelsSource.includes('data-testid="lyrics-translation-primary"') &&
    sidebarPanelsSource.includes('testId="translation-toggle"') &&
    sidebarPanelsSource.includes('data-testid="lyrics-ai-entry"') &&
    sidebarPanelsSource.includes('testId="lyrics-translation-column-tools"') &&
    sidebarPanelsSource.includes('testId="lyrics-translation-section-split"') &&
    sidebarPanelsSource.includes('testId="lyrics-translation-section-format"') &&
    sidebarPanelsSource.includes('testId="lyrics-translation-section-swap"'),
  "the translation panel leads with enablement and AI while grouping the remaining column tools"
);
assert.ok(
  sidebarSource.includes('data-testid="lyrics-translation-page-viewport"') &&
    sidebarSource.includes('testId="lyrics-translation-home-page"') &&
    sidebarSource.includes('testId={renderedAiPanel ? "lyrics-translation-ai-page" : undefined}') &&
    sidebarSource.includes('data-sidebar-page={activePage}') &&
    sidebarSource.includes('data-translation-page={aiPanel ? "ai" : "home"}') &&
    sidebarSource.includes('page="cleanup"') &&
    sidebarSource.includes('page="translation"') &&
    sidebarSource.includes('page="ai"') &&
    sidebarSource.includes("visibleTransitionFrom") &&
    sidebarNavigationSource.includes('pendingFocusRef.current === "ai"') &&
    !sidebarSource.includes('data-testid="lyrics-ai-panel-boundary"'),
  "the sidebar owns one retained cleanup, translation, and AI page deck with post-animation focus"
);
assert.ok(
  sidebarSource.includes('"absolute inset-0 h-full min-h-0"') &&
    sidebarSource.includes("hidden={!visible}") &&
    sidebarSource.includes("inert={active ? undefined : true}") &&
    sidebarSource.includes("aria-hidden={active ? undefined : true}") &&
    sidebarSource.includes('pointerEvents: active ? "auto" : "none"'),
  "each sidebar page retains independent state while inactive and exiting pages leave the interaction tree"
);
assert.ok(
  sidebarNavigationSource.includes("useAppReducedMotion") &&
    sidebarSource.includes('pageOffset < 0') &&
    sidebarSource.includes('pageOffset > 0') &&
    sidebarSource.includes("reducedMotion ? reducedMotionTransition : sidebarPageTransition") &&
    aiTranslatePanelSource.includes("sidebarPageVariants(reducedMotion)") &&
    motionTokensSource.includes("function sidebarPageVariants(reducedMotion = false)") &&
    motionTokensSource.includes('direction > 0 ? "100%" : "-100%"') &&
    motionTokensSource.includes('direction > 0 ? "-100%" : "100%"'),
  "the sidebar deck and AI stage pager share full-width directional motion and remove travel under reduced motion"
);
assert.ok(
  aiTranslatePanelSource.includes('data-presentation="sidebar-page"') &&
    aiTranslatePanelSource.includes('data-testid="lyrics-ai-page-back"') &&
    aiTranslatePanelSource.includes('data-testid="ai-translate-stage-viewport"') &&
    aiTranslatePanelSource.includes('testId="ai-translate-setup-page"') &&
    aiTranslatePanelSource.includes('testId="ai-translate-run-page"') &&
    aiTranslatePanelSource.includes('data-testid="lyrics-ai-run-page-back"') &&
    aiTranslatePanelSource.includes("if (loading) onCancel();") &&
    aiTranslatePanelSource.includes("onClose();") &&
    !aiTranslatePanelSource.includes("AiTranslatePanelPresentation") &&
    !aiTranslatePanelSource.includes("inlinePanel") &&
    !aiTranslatePanelSource.includes("ai-inline-panel") &&
    !editorStepsSource.includes('presentation="sidebar-page"'),
  "AI translation exposes only the active sidebar setup and runtime pages"
);
assert.ok(
  commandBarSource.includes('role="toolbar"') &&
    commandBarSource.includes('testId="lyrics-command-keep-selection"') &&
    commandBarSource.indexOf('testId="lyrics-command-keep-selection"') <
      commandBarSource.indexOf('testId="lyrics-command-undo"') &&
    commandBarSource.includes('emphasis && "lyrics-command-button--accent"') &&
    commandBarSource.includes('testId="lyrics-command-undo"') &&
    commandBarSource.includes('testId="lyrics-command-redo"') &&
    commandBarSource.includes('testId="lyrics-command-clean-paste"') &&
    commandBarSource.includes('testId="lyrics-command-collapse-blanks"') &&
    commandBarSource.includes('testId="lyrics-command-strip-lrc"') &&
    commandBarSource.includes('testId="lyrics-command-ai"') &&
    commandBarSource.includes('data-testid="lyrics-status-bar"') &&
    commandBarSource.includes("showSidebarToggle ?") &&
    commandBarSource.includes("{lyricsFetchAction}") &&
    commandBarSource.includes("{reviewAction}") &&
    reviewMenuSource.includes('data-testid="lyrics-command-review"') &&
    reviewMenuSource.includes('data-testid="lyrics-line-budget"') &&
    fetchPanelSource.includes('data-testid="lyrics-command-fetch"') &&
    fetchPanelSource.includes('data-testid="lyrics-fetch-panel-boundary"') &&
    !commandBarSource.includes("lyrics-command-budget") &&
    !commandBarSource.includes("lyrics-command-find") &&
    !commandBarSource.includes("lyrics-find-input"),
  "the command strip includes document status, editing actions, and independent fetch/review actions"
);
assert.ok(
  copySource.includes("openDrawer") &&
    copySource.includes("closeDrawer") &&
    !copySource.includes("resizeSidebar") &&
    !copySource.includes("collapseSidebar") &&
    !copySource.includes("expandSidebar"),
  "desktop resize and collapse copy is removed while narrow layouts use drawer language"
);
assert.ok(
  sidebarSource.includes('role="tablist"') &&
    sidebarSource.includes('page="cleanup"') &&
    sidebarSource.includes('page="translation"') &&
    !sidebarSource.includes('page="review"') &&
    !sidebarSource.includes('page="source"') &&
    sidebarSource.includes("hidden={!visible}") &&
    sidebarSource.includes('data-testid="lyrics-sidebar-panels"') &&
    sidebarNavigationSource.includes('event.key === "ArrowRight"') &&
    sidebarSource.includes("tabIndex={activeTab === tab ? 0 : -1}"),
  "the sidebar keeps cleanup and translation roots with roving keyboard navigation and retained motion pages"
);
assert.ok(
  editorStepsSource.includes("lyricsFetchPanel={(") &&
    editorStepsSource.includes("available={canFetchLyrics}"),
  "the independent fetch command remains mounted and reflects source availability"
);
assert.ok(
  documentControllerSource.includes("cleanSynchronizedBlankRows") &&
    sidebarPanelsSource.includes("alignedColumnsHint") &&
    sidebarPanelsSource.includes('testId="lyrics-cleanup-scope-synchronized"') &&
    sidebarPanelsSource.includes('data-testid="lyrics-cleanup-scope-summary"') &&
    sidebarPanelsSource.includes('label: `${copy.original}/${copy.translation}`') &&
    sidebarPanelsSource.includes('testId="lyrics-cleanup-blank-all-preview"') &&
    sidebarPanelsSource.includes('testId="lyrics-cleanup-blank-all"'),
  "the compact context bar names whole columns or selected lines while synchronized blank cleanup stays explicit and previewed"
);
assert.ok(
  globalsSource.includes(".lyrics-sidebar--drawer") &&
    globalsSource.includes("position: absolute") &&
    workspaceSource.includes('data-testid="lyrics-sidebar-backdrop"') &&
    sidebarSource.includes('role={mobileDrawer ? "dialog" : undefined}') &&
    sidebarNavigationSource.includes('event.key === "Escape"') &&
    sidebarNavigationSource.includes("if (aiPanel)") &&
    sidebarNavigationSource.includes("onCloseAITranslate()"),
  "narrow layouts dismiss the AI child page before closing the modal overlay drawer"
);
for (const locale of ['zh:', '"zh-TW":', 'en:', 'fr:', 'ja:', 'es:']) {
  assert.ok(copySource.includes(locale), `workspace copy includes ${locale}`);
}
for (const key of ["commonCleanupHeading", "moreCleanupHeading", "columnToolsHeading"]) {
  assert.equal(copySource.match(new RegExp(`${key}:`, "g"))?.length, 7, `${key} is typed and localized in all six workspace locales`);
}
assert.ok(
    copySource.includes("duplicateLineIssue") &&
    reviewMenuSource.includes("issue.kind === \"duplicate-line\"") &&
    !sidebarPanelsSource.includes("removeDuplicate"),
  "duplicate lines are reported for navigation and never silently deleted"
);
assert.ok(
  sidebarSource.includes('from "@/components/editor/LyricsSidebarPanels"') &&
    sidebarSource.includes('from "@/components/editor/hooks/useLyricsSidebarNavigation"') &&
    !sidebarSource.includes("useLayoutEffect") &&
    !sidebarSource.includes("function LyricsCleanupPanel") &&
    sidebarNavigationSource.includes("getClientRects().length > 0") &&
    sidebarPanelsSource.includes("export function LyricsCleanupPanel") &&
    sidebarPanelsSource.includes("export function LyricsTranslationPanel"),
  "sidebar navigation and focus are isolated from the retained Cleanup and Translation presentation"
);
assert.ok(
  workspaceSource.includes('from "@/components/editor/hooks/useLyricsWorkspaceDocumentController"') &&
    !workspaceSource.includes("recordLyricsOperation") &&
    !workspaceSource.includes("pendingSelectionRef") &&
    documentControllerSource.includes("recordLyricsOperation") &&
    documentControllerSource.includes("pendingSelectionRef") &&
    documentControllerSource.includes("captureCurrentSelection") &&
    documentControllerSource.includes("undoLyricsOperation") &&
    documentControllerSource.includes("redoLyricsOperation"),
  "workspace document transforms, history, and selection restoration live in one dedicated controller"
);
assert.ok(
  !workspaceSource.includes('editor.style.height = "auto"') &&
    workspaceSource.includes('entries.map(({ measure }) => measure.scrollHeight)') &&
    workspaceSource.includes('data-lyrics-editor-measure="true"') &&
    workspaceSource.indexOf("const commonHeight") < workspaceSource.indexOf("for (const { editor } of entries)"),
  "textarea auto-height reads isolated mirrors in one batch before writing final live heights"
);
assert.ok(
  documentControllerSource.includes('updateCursor(event, "lyrics", true)') &&
    documentControllerSource.includes('updateCursor(event, "translation", true)') &&
    documentControllerSource.includes("forceAnchorCapture || selectionChanged || activeEditorChanged") &&
    documentControllerSource.includes("textSelectionsEqual(previousSelection, selection)") &&
    documentControllerSource.includes("restoreViewportAnchor(pending)") &&
    viewportSessionSource.includes("restoreSelectionRef.current?.editor === editorKey") &&
    documentControllerSource.indexOf("selectionsRef.current = nextSelections") <
      documentControllerSource.indexOf("editor.setSelectionRange(selection.start, selection.end)"),
  "restored selections publish synchronous refs and override only DOM selection while semantic scroll anchors remain stable"
);
assert.ok(
  documentControllerSource.includes("historyRef.current.past.length > 0 || historyRef.current.future.length > 0") &&
    documentControllerSource.includes("setFeedback((current) => current === null ? current : null)"),
  "external document changes only publish a history revision when undo or redo availability actually changes"
);
assert.ok(
  viewportSessionSource.includes("const editorCandidates = activeEditor === fallbackEditor") &&
    viewportSessionSource.includes("One active semantic snapshot is sufficient") &&
    viewportSessionSource.includes("scrollCaptureFrameRef.current = window.requestAnimationFrame") &&
    viewportSessionSource.includes("if (restorationPendingRef.current || scrollCaptureFrameRef.current) return"),
  "viewport capture reads one active editor and coalesces scroll events to one capture per animation frame"
);
assert.ok(
  !stepperSource.includes("useLyricsWorkspaceSplit") &&
    !stepperSource.includes("lyrics-workspace-resizer"),
  "the step-two split stays inside LyricsWorkspace and leaves the shared Stepper structure unchanged"
);

console.log(JSON.stringify({ ok: true, lyricsWorkspaceLayoutTests: 61 }, null, 2));
