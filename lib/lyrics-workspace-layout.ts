import {
  resolveResizableSplit,
  type ResizableSplitGeometry
} from "@/lib/resizable-split";

const DEFAULT_EDITOR_RATIO = 2 / 3;
const MIN_EDITOR_WIDTH = 600;
const MIN_TOOLS_WIDTH = 300;
const EXPANDED_GAP = 8;
const MIN_SIDE_BY_SIDE_WIDTH = MIN_EDITOR_WIDTH + MIN_TOOLS_WIDTH + EXPANDED_GAP;

export type LyricsWorkspaceSplitGeometry = ResizableSplitGeometry & {
  editorWidth: number;
  toolsWidth: number;
};

export function resolveLyricsWorkspaceSplit(
  viewportWidth: number
): LyricsWorkspaceSplitGeometry {
  const split = resolveResizableSplit({
    viewportWidth,
    requestedRatio: DEFAULT_EDITOR_RATIO,
    defaultRatio: DEFAULT_EDITOR_RATIO,
    minRatio: DEFAULT_EDITOR_RATIO,
    maxRatio: DEFAULT_EDITOR_RATIO,
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
  MIN_EDITOR_WIDTH,
  MIN_TOOLS_WIDTH,
  EXPANDED_GAP,
  MIN_SIDE_BY_SIDE_WIDTH
};
