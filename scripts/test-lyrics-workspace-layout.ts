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
const copySource = readFileSync(resolve("components/editor/lyrics-workspace-copy.ts"), "utf8");
const workspaceSplitHookSource = readFileSync(resolve("components/editor/hooks/useLyricsWorkspaceSplit.ts"), "utf8");
const stepperSource = readFileSync(resolve("components/editor/SettingsStepper.tsx"), "utf8");
const globalsSource = readFileSync(resolve("app/globals.css"), "utf8");

assert.ok(
  editorStepsSource.includes('useState<LyricsSidebarTab>("cleanup")') &&
    !editorStepsSource.includes("lyricsWorkspaceLayoutReducer") &&
    !editorStepsSource.includes("workspaceLayout={lyricsWorkspaceLayout}") &&
    !editorStepsSource.includes("onWorkspaceLayoutAction"),
  "step two keeps only active-tab state after removing adjustable layout state"
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
    sidebarSource.includes("control-surface lyrics-sidebar-action") &&
    sidebarSource.includes("<Section") &&
    globalsSource.includes(".lyrics-workspace-surface") &&
    globalsSource.includes(".lyrics-sidebar-tabs.segmented-control") &&
    globalsSource.includes(".lyrics-sidebar-section:first-child") &&
    !globalsSource.includes(".lyrics-sidebar-section--sticky") &&
    !sidebarSource.includes("sticky top-0"),
  "the workspace stays transparent while the sidebar reuses the settings control language without overlapping sticky content"
);
assert.ok(
  sidebarSource.includes('data-testid={`lyrics-sidebar-tab-${tab}`}') &&
    sidebarSource.includes("tabIndex={activeTab === tab ? 0 : -1}") &&
    !sidebarSource.includes("data-collapsed") &&
    !sidebarSource.includes("lyrics-sidebar-collapsed-layer") &&
    !sidebarSource.includes("lyrics-sidebar-expanded-layer") &&
    !sidebarSource.includes("framer-motion") &&
    !sidebarSource.includes('data-testid="lyrics-sidebar-budget"') &&
    !sidebarSource.includes("<CollapsiblePanelSection") &&
    sidebarSource.includes('data-testid="lyrics-cleanup-context"') &&
    sidebarSource.includes('testId="lyrics-cleanup-section-common"') &&
    sidebarSource.includes('data-testid="lyrics-cleanup-more"') &&
    sidebarSource.includes('<details className="lyrics-sidebar-more"') &&
    sidebarSource.includes('testId="lyrics-cleanup-section-paste"') &&
    sidebarSource.includes('testId="lyrics-cleanup-section-lrc"'),
  "the always-open sidebar keeps stable tab navigation while concentrating low-frequency cleanup in one native disclosure"
);
assert.ok(
  sidebarSource.includes('data-testid="lyrics-translation-primary"') &&
    sidebarSource.includes('testId="translation-toggle"') &&
    sidebarSource.includes('data-testid="lyrics-ai-entry"') &&
    sidebarSource.includes('testId="lyrics-translation-column-tools"') &&
    sidebarSource.includes('testId="lyrics-translation-section-split"') &&
    sidebarSource.includes('testId="lyrics-translation-section-format"') &&
    sidebarSource.includes('testId="lyrics-translation-section-swap"'),
  "the translation panel leads with enablement and AI while grouping the remaining column tools"
);
assert.ok(
  commandBarSource.includes('role="toolbar"') &&
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
    sidebarSource.includes('tab="cleanup"') &&
    sidebarSource.includes('tab="translation"') &&
    !sidebarSource.includes('tab="review"') &&
    !sidebarSource.includes('tab="source"') &&
    sidebarSource.includes("hidden={activeTab !== tab}") &&
    sidebarSource.includes('data-testid="lyrics-sidebar-panels"') &&
    sidebarSource.includes('event.key === "ArrowRight"') &&
    sidebarSource.includes("tabIndex={activeTab === tab ? 0 : -1}"),
  "the sidebar keeps only cleanup and translation panels with roving keyboard navigation"
);
assert.ok(
  editorStepsSource.includes("lyricsFetchPanel={(") &&
    editorStepsSource.includes("available={canFetchLyrics}"),
  "the independent fetch command remains mounted and reflects source availability"
);
assert.ok(
  workspaceSource.includes("cleanSynchronizedBlankRows") &&
    sidebarSource.includes("alignedColumnsHint") &&
    sidebarSource.includes('testId="lyrics-cleanup-scope-synchronized"') &&
    sidebarSource.includes('data-testid="lyrics-cleanup-scope-summary"') &&
    sidebarSource.includes('label: `${copy.original}/${copy.translation}`') &&
    sidebarSource.includes('testId="lyrics-cleanup-blank-all-preview"') &&
    sidebarSource.includes('testId="lyrics-cleanup-blank-all"'),
  "the compact context bar names whole columns or selected lines while synchronized blank cleanup stays explicit and previewed"
);
assert.ok(
  globalsSource.includes(".lyrics-sidebar--drawer") &&
    globalsSource.includes("position: absolute") &&
    workspaceSource.includes('data-testid="lyrics-sidebar-backdrop"') &&
    sidebarSource.includes('role={mobileDrawer ? "dialog" : undefined}') &&
    sidebarSource.includes('event.key === "Escape"'),
  "narrow layouts use a keyboard-dismissible modal overlay drawer instead of shrinking the editor"
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
    !sidebarSource.includes("removeDuplicate"),
  "duplicate lines are reported for navigation and never silently deleted"
);
assert.ok(
  !stepperSource.includes("useLyricsWorkspaceSplit") &&
    !stepperSource.includes("lyrics-workspace-resizer"),
  "the step-two split stays inside LyricsWorkspace and leaves the shared Stepper structure unchanged"
);

console.log(JSON.stringify({ ok: true, lyricsWorkspaceLayoutTests: 47 }, null, 2));
