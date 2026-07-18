import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  __internalLyricsWorkspaceLayout,
  createLyricsWorkspaceLayoutState,
  lyricsWorkspaceLayoutReducer,
  resolveLyricsWorkspaceSplit
} from "../lib/lyrics-workspace-layout";
import {
  resolveSplitKeyboardRatio,
  resolveSplitPointerRatio
} from "../lib/resizable-split";

const {
  DEFAULT_EDITOR_RATIO,
  MIN_EDITOR_RATIO,
  MAX_EDITOR_RATIO,
  MIN_EDITOR_WIDTH,
  MIN_TOOLS_WIDTH,
  EXPANDED_GAP,
  COLLAPSED_TOOLS_WIDTH,
  MIN_SIDE_BY_SIDE_WIDTH
} = __internalLyricsWorkspaceLayout;

const defaultSplit = resolveLyricsWorkspaceSplit(1220, DEFAULT_EDITOR_RATIO);
assert.equal(defaultSplit.usableWidth, 1200);
assert.equal(defaultSplit.editorWidth, 900, "the lyrics editor defaults to three quarters of usable width");
assert.equal(defaultSplit.toolsWidth, 300, "the expanded tools default to one quarter of usable width");
assert.equal(defaultSplit.gap, 20, "the expanded separator keeps the shared 20px hit area");

const expandedTools = resolveLyricsWorkspaceSplit(1220, MIN_EDITOR_RATIO);
assert.ok(Math.abs(expandedTools.editorWidth - 800) < 0.001);
assert.ok(Math.abs(expandedTools.toolsWidth - 400) < 0.001);
assert.ok(Math.abs(expandedTools.ratio - 2 / 3) < 0.0001, "tools can expand to one third without shrinking the editor further");

const minimumSplit = resolveLyricsWorkspaceSplit(MIN_SIDE_BY_SIDE_WIDTH, DEFAULT_EDITOR_RATIO);
assert.ok(Math.abs(minimumSplit.editorWidth - MIN_EDITOR_WIDTH) < 0.001);
assert.ok(Math.abs(minimumSplit.toolsWidth - MIN_TOOLS_WIDTH) < 0.001);
assert.equal(
  minimumSplit.editorWidth + minimumSplit.toolsWidth + EXPANDED_GAP,
  MIN_SIDE_BY_SIDE_WIDTH,
  "minimum width constraints fit without horizontal overflow"
);

let layout = createLyricsWorkspaceLayoutState();
assert.deepEqual(layout, {
  editorRatio: 0.75,
  lastExpandedEditorRatio: 0.75,
  collapsed: false
});
layout = lyricsWorkspaceLayoutReducer(layout, { type: "set-ratio", ratio: MIN_EDITOR_RATIO });
layout = lyricsWorkspaceLayoutReducer(layout, { type: "collapse" });
assert.equal(layout.collapsed, true);
assert.equal(layout.lastExpandedEditorRatio, MIN_EDITOR_RATIO);
layout = lyricsWorkspaceLayoutReducer(layout, { type: "expand" });
assert.equal(layout.collapsed, false);
assert.equal(layout.editorRatio, MIN_EDITOR_RATIO, "expanding restores the last expanded ratio");
layout = lyricsWorkspaceLayoutReducer(layout, { type: "reset-ratio" });
assert.equal(layout.editorRatio, DEFAULT_EDITOR_RATIO, "double-click reset returns to the three-quarter default");

assert.equal(
  resolveSplitKeyboardRatio({
    key: "ArrowLeft",
    shiftKey: false,
    currentRatio: MAX_EDITOR_RATIO,
    minRatio: MIN_EDITOR_RATIO,
    maxRatio: MAX_EDITOR_RATIO
  }),
  0.73
);
assert.equal(
  resolveSplitKeyboardRatio({
    key: "ArrowLeft",
    shiftKey: true,
    currentRatio: MAX_EDITOR_RATIO,
    minRatio: MIN_EDITOR_RATIO,
    maxRatio: MAX_EDITOR_RATIO
  }),
  0.7,
  "Shift accelerates keyboard resizing"
);
assert.equal(
  resolveSplitKeyboardRatio({
    key: "Home",
    shiftKey: false,
    currentRatio: DEFAULT_EDITOR_RATIO,
    minRatio: MIN_EDITOR_RATIO,
    maxRatio: MAX_EDITOR_RATIO
  }),
  MIN_EDITOR_RATIO
);
assert.equal(
  resolveSplitKeyboardRatio({
    key: "End",
    shiftKey: false,
    currentRatio: MIN_EDITOR_RATIO,
    minRatio: MIN_EDITOR_RATIO,
    maxRatio: MAX_EDITOR_RATIO
  }),
  MAX_EDITOR_RATIO
);
assert.equal(
  resolveSplitKeyboardRatio({
    key: "Enter",
    shiftKey: false,
    currentRatio: DEFAULT_EDITOR_RATIO,
    minRatio: MIN_EDITOR_RATIO,
    maxRatio: MAX_EDITOR_RATIO
  }),
  null
);

assert.equal(
  resolveSplitPointerRatio({
    clientX: 810,
    viewportLeft: 0,
    viewportWidth: 1220,
    gap: EXPANDED_GAP,
    minRatio: MIN_EDITOR_RATIO,
    maxRatio: MAX_EDITOR_RATIO
  }),
  MIN_EDITOR_RATIO,
  "pointer geometry measures from the separator center and clamps at one third tools"
);

assert.equal(COLLAPSED_TOOLS_WIDTH, 64, "the collapsed tool rail stays approximately 64px wide");

const editorStepsSource = readFileSync(resolve("components/editor/useEditorSteps.tsx"), "utf8");
const workspaceSource = readFileSync(resolve("components/editor/LyricsWorkspace.tsx"), "utf8");
const commandBarSource = readFileSync(resolve("components/editor/LyricsCommandBar.tsx"), "utf8");
const sidebarSource = readFileSync(resolve("components/editor/LyricsSidebar.tsx"), "utf8");
const copySource = readFileSync(resolve("components/editor/lyrics-workspace-copy.ts"), "utf8");
const resizableSource = readFileSync(resolve("components/editor/hooks/useResizableSplit.ts"), "utf8");
const stepperSource = readFileSync(resolve("components/editor/SettingsStepper.tsx"), "utf8");
const globalsSource = readFileSync(resolve("app/globals.css"), "utf8");

assert.ok(
    editorStepsSource.includes("useReducer(") &&
      editorStepsSource.includes("lyricsWorkspaceLayoutReducer") &&
      editorStepsSource.includes('useState<LyricsSidebarTab>("cleanup")') &&
      editorStepsSource.includes("workspaceLayout={lyricsWorkspaceLayout}"),
  "split and active-tab state are owned above the step-two content lifecycle"
);
assert.ok(
  workspaceSource.includes('data-testid="lyrics-workspace-resizer"') &&
    workspaceSource.includes('role="separator"') &&
    workspaceSource.includes('aria-orientation="vertical"') &&
    workspaceSource.includes('aria-valuemin=') &&
    workspaceSource.includes('aria-valuemax=') &&
    workspaceSource.includes('aria-valuenow=') &&
    workspaceSource.includes('aria-valuetext='),
  "the lyrics separator exposes the complete ARIA contract"
);
assert.ok(
  resizableSource.includes("onDoubleClick: reset") &&
    resizableSource.includes("setPointerCapture") &&
    resizableSource.includes("resolveSplitKeyboardRatio"),
  "pointer, keyboard, and double-click behavior share one interaction hook"
);
assert.ok(
  workspaceSource.includes('data-testid="lyrics-shared-scroll"') &&
    (workspaceSource.match(/overflow-y-auto/g)?.length ?? 0) === 1 &&
    workspaceSource.includes("<LyricsCommandBar"),
  "the two editors retain one shared vertical scroller beneath one compact command bar"
);
assert.ok(
  sidebarSource.includes('data-collapsed={collapsed ? "true" : "false"}') &&
    sidebarSource.includes('testId={`lyrics-sidebar-tab-${tab}`}') &&
    sidebarSource.includes('data-testid="lyrics-sidebar-budget"') &&
    !sidebarSource.includes("lyrics-tool-split-collapsed"),
  "the collapsed rail keeps stable tab icons and status without duplicating every tool"
);
assert.ok(
  commandBarSource.includes('role="toolbar"') &&
    commandBarSource.includes('testId="lyrics-command-undo"') &&
    commandBarSource.includes('testId="lyrics-command-redo"') &&
    commandBarSource.includes('testId="lyrics-command-blank"') &&
    commandBarSource.includes('testId="lyrics-command-find"') &&
    commandBarSource.includes('testId="lyrics-command-ai"') &&
    commandBarSource.includes('data-testid="lyrics-command-budget"') &&
    commandBarSource.includes("copy.lineBudgetLabel"),
  "the compact command bar exposes history, cleanup, find, AI, budget, and sidebar controls"
);
assert.ok(
  sidebarSource.includes('role="tablist"') &&
    sidebarSource.includes('tab="cleanup"') &&
    sidebarSource.includes('tab="translation"') &&
    sidebarSource.includes('tab="review"') &&
    sidebarSource.includes('tab="source"') &&
    sidebarSource.includes("hidden={activeTab !== tab}") &&
    sidebarSource.includes('data-testid="lyrics-sidebar-panels"') &&
    sidebarSource.includes('collapsed && "hidden"') &&
    sidebarSource.includes('event.key === "ArrowRight"') &&
    sidebarSource.includes("tabIndex={activeTab === tab ? 0 : -1}"),
  "all four stable panels remain mounted across tab and rail visibility changes and expose roving keyboard navigation"
);
assert.ok(
  editorStepsSource.includes("lyricsFetchPanel={canFetchLyrics ? (") &&
    !editorStepsSource.includes("canFetchLyrics && !ai.isOpen"),
  "the source panel no longer disappears when the AI translation panel opens"
);
assert.ok(
  workspaceSource.includes("cleanSynchronizedBlankRows") &&
    sidebarSource.includes("alignedColumnsHint") &&
    sidebarSource.includes('testId="lyrics-cleanup-scope-synchronized"') &&
    sidebarSource.includes('data-testid="lyrics-cleanup-scope-summary"') &&
    sidebarSource.includes('testId="lyrics-cleanup-blank-all-preview"') &&
    sidebarSource.includes('testId="lyrics-cleanup-blank-all"'),
  "two-column blank cleanup is explicit, previewed, and keeps the active scope visible"
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
assert.ok(
  copySource.includes("duplicateLineIssue") &&
    sidebarSource.includes("issue.kind === \"duplicate-line\"") &&
    !sidebarSource.includes("removeDuplicate"),
  "duplicate lines are reported for navigation and never silently deleted"
);
assert.ok(
  !stepperSource.includes("useLyricsWorkspaceSplit") &&
    !stepperSource.includes("lyrics-workspace-resizer"),
  "the step-two split stays inside LyricsWorkspace and leaves the shared Stepper structure unchanged"
);

console.log(JSON.stringify({ ok: true, lyricsWorkspaceLayoutTests: 40 }, null, 2));
