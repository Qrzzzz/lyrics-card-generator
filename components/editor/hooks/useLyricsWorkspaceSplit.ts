"use client";

import { useResizableSplit } from "@/components/editor/hooks/useResizableSplit";
import {
  __internalLyricsWorkspaceLayout,
  type LyricsWorkspaceLayoutAction,
  type LyricsWorkspaceLayoutState,
  resolveLyricsWorkspaceSplit
} from "@/lib/lyrics-workspace-layout";

const LYRICS_WORKSPACE_DESKTOP_QUERY = "(min-width: 900px)";

type UseLyricsWorkspaceSplitInput = {
  layout: LyricsWorkspaceLayoutState;
  onLayoutAction: (action: LyricsWorkspaceLayoutAction) => void;
  onBeforeLayoutChange?: () => void;
};

export function useLyricsWorkspaceSplit({
  layout,
  onLayoutAction,
  onBeforeLayoutChange
}: UseLyricsWorkspaceSplitInput) {
  const split = useResizableSplit({
    requestedRatio: layout.editorRatio,
    onRequestedRatioChange: (ratio) => {
      onBeforeLayoutChange?.();
      onLayoutAction({ type: "set-ratio", ratio });
    },
    defaultRatio: __internalLyricsWorkspaceLayout.DEFAULT_EDITOR_RATIO,
    minRatio: __internalLyricsWorkspaceLayout.MIN_EDITOR_RATIO,
    maxRatio: __internalLyricsWorkspaceLayout.MAX_EDITOR_RATIO,
    minLeadingWidth: __internalLyricsWorkspaceLayout.MIN_EDITOR_WIDTH,
    minTrailingWidth: __internalLyricsWorkspaceLayout.MIN_TOOLS_WIDTH,
    gap: __internalLyricsWorkspaceLayout.EXPANDED_GAP,
    desktopQuery: LYRICS_WORKSPACE_DESKTOP_QUERY,
    minimumViewportWidth: __internalLyricsWorkspaceLayout.MIN_SIDE_BY_SIDE_WIDTH
  });

  return {
    ...split,
    geometry: resolveLyricsWorkspaceSplit(split.geometry.viewportWidth, layout.editorRatio)
  };
}
