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
const toolsSource = readFileSync(resolve("components/editor/LyricsToolsAside.tsx"), "utf8");
const resizableSource = readFileSync(resolve("components/editor/hooks/useResizableSplit.ts"), "utf8");
const stepperSource = readFileSync(resolve("components/editor/SettingsStepper.tsx"), "utf8");

assert.ok(
  editorStepsSource.includes("useReducer(") &&
    editorStepsSource.includes("lyricsWorkspaceLayoutReducer") &&
    editorStepsSource.includes("workspaceLayout={lyricsWorkspaceLayout}"),
  "the split state is owned above the step-two content lifecycle"
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
    workspaceSource.includes('data-testid="lyrics-editor-status"'),
  "the two editors retain one shared vertical scroller and one compact sticky status bar"
);
assert.ok(
  toolsSource.includes('data-collapsed={collapsed ? "true" : "false"}') &&
    toolsSource.includes('testId="lyrics-tool-ai-collapsed"') &&
    toolsSource.includes('data-testid="translation-toggle"') &&
    toolsSource.includes('testId="lyrics-tool-split-collapsed"') &&
    toolsSource.includes('data-testid="lyrics-line-budget"'),
  "the collapsed rail keeps every required essential control"
);
assert.ok(
  !stepperSource.includes("useLyricsWorkspaceSplit") &&
    !stepperSource.includes("lyrics-workspace-resizer"),
  "the step-two split stays inside LyricsWorkspace and leaves the shared Stepper structure unchanged"
);

console.log(JSON.stringify({ ok: true, lyricsWorkspaceLayoutTests: 30 }, null, 2));
