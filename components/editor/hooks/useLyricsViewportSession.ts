"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";

export type LyricsViewportMode = "standard" | "expanded" | "immersive";
export type LyricsEditorKey = "lyrics" | "translation";

type ViewportMetrics = {
  minHeight: number;
  standardHeight: number;
  expandedHeight: number;
  maxHeight: number;
};

type SessionState = {
  mode: LyricsViewportMode;
  previousMode: Exclude<LyricsViewportMode, "immersive">;
};

type PersistedSessionState = {
  mode: Exclude<LyricsViewportMode, "immersive">;
};

type TextAnchor = {
  lineIndex: number;
  lineCount: number;
  paragraphIndex: number;
  paragraphLineOffset: number;
  lineRatio: number;
};

type EditorSnapshot = TextAnchor & {
  editor: LyricsEditorKey;
  selectionStart: number;
  selectionEnd: number;
  viewportOffset: number;
  viewportCenterRatio: number;
  scrollRatio: number;
};

type AnchorSnapshot = {
  activeEditor: LyricsEditorKey;
  editors: Partial<Record<LyricsEditorKey, EditorSnapshot>>;
  viewportCenterRatio: number | null;
  scrollRatio: number;
};

type UseLyricsViewportSessionOptions = {
  workspaceRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  getActiveEditorKey?: () => LyricsEditorKey;
  getEditor?: (editor: LyricsEditorKey) => HTMLTextAreaElement | null;
};

const SESSION_STORAGE_KEY = "lyrics-card-generator:lyrics-viewport";
const STANDARD_RATIO = 0.68;
const EXPANDED_RATIO = 0.84;
const MIN_VIEWPORT_HEIGHT = 240;
const MIN_FALLBACK_HEIGHT = 240;
const IMMERSIVE_SNAP_THRESHOLD = 24;
const EDITOR_KEYS: LyricsEditorKey[] = ["lyrics", "translation"];

const DEFAULT_SESSION: SessionState = {
  mode: "standard",
  previousMode: "standard"
};

const DEFAULT_METRICS: ViewportMetrics = {
  minHeight: MIN_VIEWPORT_HEIGHT,
  standardHeight: 520,
  expandedHeight: 640,
  maxHeight: 760
};

export function useLyricsViewportSession({
  workspaceRef,
  scrollRef,
  getActiveEditorKey,
  getEditor
}: UseLyricsViewportSessionOptions) {
  const [session, setSession] = useState<SessionState>(DEFAULT_SESSION);
  const [metrics, setMetrics] = useState<ViewportMetrics>(DEFAULT_METRICS);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const dragStartRef = useRef<{ clientY: number; height: number } | null>(null);
  const anchorRef = useRef<AnchorSnapshot | null>(null);
  const restoreFrameRef = useRef(0);
  const activeEditorKeyGetterRef = useRef(getActiveEditorKey);
  const editorGetterRef = useRef(getEditor);
  const editorNodesRef = useRef<Partial<Record<LyricsEditorKey, HTMLTextAreaElement>>>({});

  activeEditorKeyGetterRef.current = getActiveEditorKey;
  editorGetterRef.current = getEditor;

  const captureAnchor = useCallback((preferredEditor?: LyricsEditorKey) => {
    const scrollNode = scrollRef.current;
    const workspace = workspaceRef.current;
    if (!scrollNode || !workspace) {
      return;
    }

    const maxScroll = Math.max(0, scrollNode.scrollHeight - scrollNode.clientHeight);
    const scrollRatio = maxScroll > 0 ? scrollNode.scrollTop / maxScroll : 0;
    const scrollRect = scrollNode.getBoundingClientRect();
    const previous = anchorRef.current;
    const editors: Partial<Record<LyricsEditorKey, EditorSnapshot>> = {
      ...previous?.editors
    };
    let viewportCenterRatio: number | null = previous?.viewportCenterRatio ?? null;

    for (const editorKey of EDITOR_KEYS) {
      const editor = editorGetterRef.current?.(editorKey) ?? null;
      if (!isConnectedEditorInWorkspace(editor, workspace, scrollNode)) {
        continue;
      }

      const editorRect = editor.getBoundingClientRect();
      const editorContentTop = editorRect.top - scrollRect.top + scrollNode.scrollTop;
      const existingSnapshot = editors[editorKey];
      const preservedSnapshot = editorNodesRef.current[editorKey] !== editor
        ? existingSnapshot
        : undefined;
      const selectionStart = clamp(
        preservedSnapshot?.selectionStart ?? editor.selectionStart ?? 0,
        0,
        editor.value.length
      );
      const selectionEnd = clamp(
        preservedSnapshot?.selectionEnd ?? editor.selectionEnd ?? selectionStart,
        selectionStart,
        editor.value.length
      );
      const textAnchor = getTextAnchor(editor.value, selectionStart);
      const anchorPosition = editorContentTop + editor.scrollHeight * textAnchor.lineRatio;
      const centerRatio = clamp(
        (scrollNode.scrollTop + scrollNode.clientHeight / 2 - editorContentTop) / Math.max(1, editor.scrollHeight),
        0,
        1
      );

      editors[editorKey] = {
        editor: editorKey,
        selectionStart,
        selectionEnd,
        ...textAnchor,
        viewportOffset: anchorPosition - scrollNode.scrollTop,
        viewportCenterRatio: centerRatio,
        scrollRatio
      };

      if (editorKey === (preferredEditor ?? activeEditorKeyGetterRef.current?.() ?? "lyrics")) {
        viewportCenterRatio = centerRatio;
      }
      editorNodesRef.current[editorKey] = editor;
    }

    const activeEditor = preferredEditor ?? activeEditorKeyGetterRef.current?.() ?? previous?.activeEditor ?? "lyrics";
    anchorRef.current = { activeEditor, editors, viewportCenterRatio, scrollRatio };
  }, [scrollRef, workspaceRef]);

  const restoreAnchor = useCallback(() => {
    window.cancelAnimationFrame(restoreFrameRef.current);
    restoreFrameRef.current = window.requestAnimationFrame(() => {
      const scrollNode = scrollRef.current;
      const workspace = workspaceRef.current;
      const snapshot = anchorRef.current;
      if (!scrollNode || !workspace || !snapshot) {
        return;
      }

      const maxScroll = Math.max(0, scrollNode.scrollHeight - scrollNode.clientHeight);
      const connectedEditors = Object.fromEntries(
        EDITOR_KEYS.map((editorKey) => {
          const editor = editorGetterRef.current?.(editorKey) ?? null;
          return [editorKey, isConnectedEditorInWorkspace(editor, workspace, scrollNode) ? editor : null];
        })
      ) as Record<LyricsEditorKey, HTMLTextAreaElement | null>;

      for (const editorKey of EDITOR_KEYS) {
        const editor = connectedEditors[editorKey];
        const editorSnapshot = snapshot.editors[editorKey];
        if (!editor || !editorSnapshot) {
          continue;
        }
        const selectionStart = clamp(editorSnapshot.selectionStart, 0, editor.value.length);
        const selectionEnd = clamp(editorSnapshot.selectionEnd, selectionStart, editor.value.length);
        editor.setSelectionRange(selectionStart, selectionEnd);
        editorNodesRef.current[editorKey] = editor;
      }

      const sourceSnapshot = snapshot.editors[snapshot.activeEditor];
      const directEditor = connectedEditors[snapshot.activeEditor];
      const fallbackKey = snapshot.activeEditor === "translation" ? "lyrics" : "translation";
      const fallbackEditor = connectedEditors[fallbackKey];
      const editor = directEditor ?? fallbackEditor;

      if (!editor || !sourceSnapshot) {
        scrollNode.scrollTop = clamp(snapshot.scrollRatio * maxScroll, 0, maxScroll);
        return;
      }

      const scrollRect = scrollNode.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      const editorContentTop = editorRect.top - scrollRect.top + scrollNode.scrollTop;
      const mappedRatio = directEditor
        ? sourceSnapshot.lineRatio
        : resolveMappedTextAnchorRatio(sourceSnapshot, editor.value);

      if (mappedRatio !== null) {
        const anchorPosition = editorContentTop + editor.scrollHeight * mappedRatio;
        scrollNode.scrollTop = resolveAnchoredScrollTop({
          anchorPosition,
          viewportOffset: sourceSnapshot.viewportOffset,
          viewportCenterOffset: scrollNode.clientHeight / 2,
          maxScroll,
          scrollRatio: snapshot.scrollRatio,
          allowCenterFallback: !directEditor
        });
        return;
      }

      const centerRatio = sourceSnapshot.viewportCenterRatio ?? snapshot.viewportCenterRatio;
      if (centerRatio !== null) {
        const centerPosition = editorContentTop + editor.scrollHeight * centerRatio;
        scrollNode.scrollTop = clamp(centerPosition - scrollNode.clientHeight / 2, 0, maxScroll);
        return;
      }

      scrollNode.scrollTop = clamp(snapshot.scrollRatio * maxScroll, 0, maxScroll);
    });
  }, [scrollRef, workspaceRef]);

  const measureViewport = useCallback(() => {
    const workspace = workspaceRef.current;
    if (!workspace || typeof window === "undefined") {
      return;
    }

    const bounds = workspace.closest<HTMLElement>('[data-lyrics-viewport-bounds="true"]');
    const workspaceRect = workspace.getBoundingClientRect();
    const workspaceTop = Math.max(0, workspaceRect.top);
    const parentBottom = bounds?.getBoundingClientRect().bottom ?? workspace.parentElement?.getBoundingClientRect().bottom;
    const availableBottom = parentBottom && parentBottom > workspaceTop
      ? Math.min(window.innerHeight - 20, parentBottom)
      : window.innerHeight - 20;
    const nextMetrics = calculateViewportMetrics(Math.floor(availableBottom - workspaceTop));

    captureAnchor();
    setMetrics((current) => {
      if (
        current.minHeight === nextMetrics.minHeight &&
        current.standardHeight === nextMetrics.standardHeight &&
        current.expandedHeight === nextMetrics.expandedHeight &&
        current.maxHeight === nextMetrics.maxHeight
      ) {
        return current;
      }

      return nextMetrics;
    });
  }, [captureAnchor, workspaceRef]);

  useLayoutEffect(() => {
    measureViewport();
    const workspace = workspaceRef.current;
    const observedNode = workspace?.closest<HTMLElement>('[data-lyrics-viewport-bounds="true"]') ?? workspace?.parentElement ?? workspace;
    const observer = observedNode && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(measureViewport)
      : null;
    if (observedNode) {
      observer?.observe(observedNode);
    }
    window.addEventListener("resize", measureViewport);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureViewport);
    };
  }, [measureViewport, workspaceRef]);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PersistedSessionState>;
        if (isStableViewportMode(parsed.mode)) {
          setSession({
            mode: parsed.mode,
            previousMode: parsed.mode
          });
        }
      }
    } catch {
      // Session state is optional; private browsing and hardened shells may reject storage.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady || session.mode === "immersive") {
      return;
    }

    try {
      const persisted: PersistedSessionState = { mode: session.mode };
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Keep the in-memory state when session storage is unavailable.
    }
  }, [session, storageReady]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isDragging]);

  const setMode = useCallback((mode: LyricsViewportMode) => {
    captureAnchor();
    setDragHeight(null);
    setSession((current) => {
      if (mode === "immersive") {
        return {
          mode,
          previousMode: current.mode === "immersive" ? current.previousMode : current.mode
        };
      }

      return { mode, previousMode: mode };
    });
  }, [captureAnchor]);

  const resetToStandard = useCallback(() => {
    setMode("standard");
  }, [setMode]);

  const exitImmersive = useCallback(() => {
    if (session.mode !== "immersive") {
      return;
    }
    setMode(session.previousMode);
  }, [session.mode, session.previousMode, setMode]);

  useEffect(() => {
    if (session.mode !== "immersive") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      exitImmersive();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitImmersive, session.mode]);

  const modeHeight = heightForMode(session.mode, metrics);
  const viewportHeight = clamp(dragHeight ?? modeHeight, metrics.minHeight, metrics.maxHeight);

  useLayoutEffect(() => {
    restoreAnchor();
  }, [restoreAnchor, viewportHeight]);

  useEffect(() => () => window.cancelAnimationFrame(restoreFrameRef.current), []);

  function onResizePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }
    captureAnchor();
    dragStartRef.current = { clientY: event.clientY, height: viewportHeight };
    setDragHeight(viewportHeight);
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onResizePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const start = dragStartRef.current;
    if (!start || !isDragging) {
      return;
    }
    const rawHeight = clamp(start.height + event.clientY - start.clientY, metrics.standardHeight, metrics.maxHeight);
    const nextHeight = metrics.maxHeight - rawHeight <= IMMERSIVE_SNAP_THRESHOLD ? metrics.maxHeight : rawHeight;
    setDragHeight(nextHeight);
  }

  function finishPointerResize(event: ReactPointerEvent<HTMLElement>) {
    const finalHeight = dragHeight ?? viewportHeight;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStartRef.current = null;
    setIsDragging(false);
    setDragHeight(null);
    setMode(resolveModeFromHeight(finalHeight, metrics));
  }

  function onResizeKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    let nextMode: LyricsViewportMode | null = null;
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      nextMode = session.mode === "standard" ? "expanded" : "immersive";
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      nextMode = session.mode === "immersive" ? "expanded" : "standard";
    } else if (event.key === "Home") {
      nextMode = "standard";
    } else if (event.key === "End") {
      nextMode = "immersive";
    }

    if (nextMode) {
      event.preventDefault();
      setMode(nextMode);
    }
  }

  return {
    mode: session.mode,
    viewportHeight,
    minHeight: metrics.minHeight,
    maxHeight: metrics.maxHeight,
    isDragging,
    setMode,
    resetToStandard,
    exitImmersive,
    captureAnchor,
    restoreAnchor,
    resizeHandleProps: {
      onPointerDown: onResizePointerDown,
      onPointerMove: onResizePointerMove,
      onPointerUp: finishPointerResize,
      onPointerCancel: finishPointerResize,
      onKeyDown: onResizeKeyDown,
      onDoubleClick: resetToStandard
    }
  };
}

function heightForMode(mode: LyricsViewportMode, metrics: ViewportMetrics) {
  if (mode === "immersive") {
    return metrics.maxHeight;
  }
  return mode === "expanded" ? metrics.expandedHeight : metrics.standardHeight;
}

function calculateViewportMetrics(availableHeight: number): ViewportMetrics {
  const maxHeight = Math.max(MIN_FALLBACK_HEIGHT, availableHeight);
  const minHeight = Math.min(MIN_VIEWPORT_HEIGHT, maxHeight);
  const standardHeight = clamp(Math.round(maxHeight * STANDARD_RATIO), minHeight, maxHeight);
  const expandedHeight = clamp(Math.round(maxHeight * EXPANDED_RATIO), standardHeight, maxHeight);

  return { minHeight, standardHeight, expandedHeight, maxHeight };
}

function resolveModeFromHeight(height: number, metrics: ViewportMetrics): LyricsViewportMode {
  if (metrics.maxHeight - height <= IMMERSIVE_SNAP_THRESHOLD) {
    return "immersive";
  }
  const expandedBoundary = (metrics.standardHeight + metrics.expandedHeight) / 2;
  return height >= expandedBoundary ? "expanded" : "standard";
}

function isViewportMode(value: unknown): value is LyricsViewportMode {
  return value === "standard" || value === "expanded" || value === "immersive";
}

function isStableViewportMode(value: unknown): value is Exclude<LyricsViewportMode, "immersive"> {
  return isViewportMode(value) && value !== "immersive";
}

function getTextAnchor(value: string, selectionStart: number): TextAnchor {
  const normalizedSelection = clamp(selectionStart, 0, value.length);
  const lines = value.split(/\r?\n/);
  const lineIndex = value.slice(0, normalizedSelection).split(/\r?\n/).length - 1;
  const paragraphs = getParagraphLineRanges(lines);
  const paragraphIndex = paragraphs.findIndex(({ startLine, endLine }) => (
    lineIndex >= startLine && lineIndex <= endLine
  ));
  const paragraphLineOffset = paragraphIndex >= 0
    ? lineIndex - paragraphs[paragraphIndex].startLine
    : 0;

  return {
    lineIndex,
    lineCount: Math.max(1, lines.length),
    paragraphIndex,
    paragraphLineOffset,
    lineRatio: lineRatioForIndex(lineIndex, lines.length)
  };
}

function resolveMappedTextAnchorRatio(anchor: TextAnchor, targetValue: string) {
  const targetLines = targetValue.split(/\r?\n/);
  if (anchor.lineIndex >= 0 && anchor.lineIndex < targetLines.length) {
    return lineRatioForIndex(anchor.lineIndex, targetLines.length);
  }

  const targetParagraphs = getParagraphLineRanges(targetLines);
  const targetParagraph = anchor.paragraphIndex >= 0
    ? targetParagraphs[anchor.paragraphIndex]
    : undefined;
  if (targetParagraph) {
    const targetLine = Math.min(
      targetParagraph.endLine,
      targetParagraph.startLine + anchor.paragraphLineOffset
    );
    return lineRatioForIndex(targetLine, targetLines.length);
  }

  return null;
}

function getParagraphLineRanges(lines: string[]) {
  const ranges: Array<{ startLine: number; endLine: number }> = [];
  let startLine: number | null = null;

  for (let index = 0; index <= lines.length; index += 1) {
    const isContent = index < lines.length && lines[index].trim().length > 0;
    if (isContent && startLine === null) {
      startLine = index;
    } else if (!isContent && startLine !== null) {
      ranges.push({ startLine, endLine: index - 1 });
      startLine = null;
    }
  }

  return ranges;
}

function lineRatioForIndex(lineIndex: number, lineCount: number) {
  return lineCount > 1 ? clamp(lineIndex / (lineCount - 1), 0, 1) : 0;
}

function resolveAnchoredScrollTop({
  anchorPosition,
  viewportOffset,
  viewportCenterOffset,
  maxScroll,
  scrollRatio,
  allowCenterFallback
}: {
  anchorPosition: number;
  viewportOffset: number;
  viewportCenterOffset: number;
  maxScroll: number;
  scrollRatio: number;
  allowCenterFallback: boolean;
}) {
  const offsetTarget = anchorPosition - viewportOffset;
  if (!allowCenterFallback || (offsetTarget >= 0 && offsetTarget <= maxScroll)) {
    return clamp(offsetTarget, 0, maxScroll);
  }

  const centerTarget = anchorPosition - viewportCenterOffset;
  if (centerTarget >= 0 && centerTarget <= maxScroll) {
    return centerTarget;
  }

  return clamp(scrollRatio * maxScroll, 0, maxScroll);
}

function isConnectedEditorInWorkspace(
  editor: HTMLTextAreaElement | null,
  workspace: HTMLElement,
  scrollNode: HTMLElement
): editor is HTMLTextAreaElement {
  return Boolean(
    editor?.isConnected &&
    workspace.isConnected &&
    scrollNode.isConnected &&
    workspace.contains(editor) &&
    scrollNode.contains(editor)
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export const __internalLyricsViewportSession = {
  calculateViewportMetrics,
  getParagraphLineRanges,
  getTextAnchor,
  heightForMode,
  isConnectedEditorInWorkspace,
  resolveAnchoredScrollTop,
  resolveMappedTextAnchorRatio,
  resolveModeFromHeight,
  immersiveSnapThreshold: IMMERSIVE_SNAP_THRESHOLD
};
