"use client";

import { useState } from "react";
import { useResizableSplit } from "@/components/editor/hooks/useResizableSplit";
import { resolveResizableSplit, type ResizableSplitGeometry } from "@/lib/resizable-split";

const DESKTOP_WORKBENCH_QUERY = "(min-width: 1024px)";
const DEFAULT_SETTINGS_RATIO = 0.5;
const MIN_SETTINGS_RATIO = 0.5;
const MAX_SETTINGS_RATIO = 2 / 3;
const MIN_SETTINGS_WIDTH = 440;
const MIN_PREVIEW_WIDTH = 360;
const WORKBENCH_GAP = 20;

type ResolvePreviewWorkbenchSplitInput = {
  viewportWidth: number;
  requestedRatio: number;
  gap?: number;
  minSettingsRatio?: number;
  maxSettingsRatio?: number;
  minSettingsWidth?: number;
  minPreviewWidth?: number;
};

export type PreviewWorkbenchSplitGeometry = ResizableSplitGeometry & {
  settingsWidth: number;
  previewWidth: number;
};

export type PreviewWorkbenchTrackGeometry = {
  editorWidth: number;
  previewWidth: number;
  exportWidth: number;
  offset: number;
};

export function resolvePreviewWorkbenchSplit({
  viewportWidth,
  requestedRatio,
  gap = WORKBENCH_GAP,
  minSettingsRatio = MIN_SETTINGS_RATIO,
  maxSettingsRatio = MAX_SETTINGS_RATIO,
  minSettingsWidth = MIN_SETTINGS_WIDTH,
  minPreviewWidth = MIN_PREVIEW_WIDTH
}: ResolvePreviewWorkbenchSplitInput): PreviewWorkbenchSplitGeometry {
  const split = resolveResizableSplit({
    viewportWidth,
    requestedRatio,
    defaultRatio: DEFAULT_SETTINGS_RATIO,
    minRatio: minSettingsRatio,
    maxRatio: maxSettingsRatio,
    minLeadingWidth: minSettingsWidth,
    minTrailingWidth: minPreviewWidth,
    gap
  });
  return {
    ...split,
    settingsWidth: split.leadingWidth,
    previewWidth: split.trailingWidth
  };
}

export function resolvePreviewWorkbenchTrack(
  split: PreviewWorkbenchSplitGeometry,
  exportActive: boolean
): PreviewWorkbenchTrackGeometry {
  if (!exportActive) {
    return {
      editorWidth: split.settingsWidth,
      previewWidth: split.previewWidth,
      exportWidth: split.settingsWidth,
      offset: 0
    };
  }

  const balancedPanelWidth = split.usableWidth / 2;
  return {
    editorWidth: balancedPanelWidth,
    previewWidth: balancedPanelWidth,
    exportWidth: balancedPanelWidth,
    offset: split.viewportWidth > 0 ? -(balancedPanelWidth + split.gap) : 0
  };
}

export function usePreviewWorkbenchSplit(enabled = true) {
  const [requestedRatio, setRequestedRatio] = useState(DEFAULT_SETTINGS_RATIO);
  const split = useResizableSplit({
    enabled,
    requestedRatio,
    onRequestedRatioChange: setRequestedRatio,
    defaultRatio: DEFAULT_SETTINGS_RATIO,
    minRatio: MIN_SETTINGS_RATIO,
    maxRatio: MAX_SETTINGS_RATIO,
    minLeadingWidth: MIN_SETTINGS_WIDTH,
    minTrailingWidth: MIN_PREVIEW_WIDTH,
    gap: WORKBENCH_GAP,
    desktopQuery: DESKTOP_WORKBENCH_QUERY
  });

  return {
    ...split,
    geometry: resolvePreviewWorkbenchSplit({
      viewportWidth: split.geometry.viewportWidth,
      requestedRatio
    })
  };
}

export const __internalPreviewWorkbenchSplit = {
  DEFAULT_SETTINGS_RATIO,
  MIN_SETTINGS_RATIO,
  MAX_SETTINGS_RATIO,
  MIN_SETTINGS_WIDTH,
  MIN_PREVIEW_WIDTH,
  WORKBENCH_GAP
};
