import {
  clampSplitRatio,
  resolveResizableSplit,
  type ResizableSplitGeometry
} from "@/lib/resizable-split";

const DEFAULT_EDITOR_RATIO = 0.75;
const MIN_EDITOR_RATIO = 2 / 3;
const MAX_EDITOR_RATIO = 0.75;
const MIN_EDITOR_WIDTH = 600;
const MIN_TOOLS_WIDTH = 224;
const EXPANDED_GAP = 20;
const COLLAPSED_GAP = 12;
const COLLAPSED_TOOLS_WIDTH = 64;
const MIN_SIDE_BY_SIDE_WIDTH = MIN_EDITOR_WIDTH + MIN_TOOLS_WIDTH + EXPANDED_GAP;

export type LyricsWorkspaceLayoutState = {
  editorRatio: number;
  lastExpandedEditorRatio: number;
  collapsed: boolean;
};

export type LyricsWorkspaceLayoutAction =
  | { type: "set-ratio"; ratio: number }
  | { type: "collapse" }
  | { type: "expand" }
  | { type: "toggle" }
  | { type: "reset-ratio" };

export type LyricsWorkspaceSplitGeometry = ResizableSplitGeometry & {
  editorWidth: number;
  toolsWidth: number;
};

export function createLyricsWorkspaceLayoutState(): LyricsWorkspaceLayoutState {
  return {
    editorRatio: DEFAULT_EDITOR_RATIO,
    lastExpandedEditorRatio: DEFAULT_EDITOR_RATIO,
    collapsed: false
  };
}

export function lyricsWorkspaceLayoutReducer(
  state: LyricsWorkspaceLayoutState,
  action: LyricsWorkspaceLayoutAction
): LyricsWorkspaceLayoutState {
  if (action.type === "set-ratio") {
    const ratio = clampSplitRatio(action.ratio, MIN_EDITOR_RATIO, MAX_EDITOR_RATIO);
    return {
      ...state,
      editorRatio: ratio,
      lastExpandedEditorRatio: ratio
    };
  }

  if (action.type === "collapse") {
    return state.collapsed
      ? state
      : { ...state, collapsed: true, lastExpandedEditorRatio: state.editorRatio };
  }

  if (action.type === "expand") {
    return state.collapsed
      ? { ...state, collapsed: false, editorRatio: state.lastExpandedEditorRatio }
      : state;
  }

  if (action.type === "toggle") {
    return state.collapsed
      ? { ...state, collapsed: false, editorRatio: state.lastExpandedEditorRatio }
      : { ...state, collapsed: true, lastExpandedEditorRatio: state.editorRatio };
  }

  return {
    ...state,
    editorRatio: DEFAULT_EDITOR_RATIO,
    lastExpandedEditorRatio: DEFAULT_EDITOR_RATIO
  };
}

export function resolveLyricsWorkspaceSplit(
  viewportWidth: number,
  requestedRatio: number
): LyricsWorkspaceSplitGeometry {
  const split = resolveResizableSplit({
    viewportWidth,
    requestedRatio,
    defaultRatio: DEFAULT_EDITOR_RATIO,
    minRatio: MIN_EDITOR_RATIO,
    maxRatio: MAX_EDITOR_RATIO,
    minLeadingWidth: MIN_EDITOR_WIDTH,
    minTrailingWidth: MIN_TOOLS_WIDTH,
    gap: EXPANDED_GAP
  });

  return {
    ...split,
    editorWidth: split.leadingWidth,
    toolsWidth: split.trailingWidth
  };
}

export const __internalLyricsWorkspaceLayout = {
  DEFAULT_EDITOR_RATIO,
  MIN_EDITOR_RATIO,
  MAX_EDITOR_RATIO,
  MIN_EDITOR_WIDTH,
  MIN_TOOLS_WIDTH,
  EXPANDED_GAP,
  COLLAPSED_GAP,
  COLLAPSED_TOOLS_WIDTH,
  MIN_SIDE_BY_SIDE_WIDTH
};
