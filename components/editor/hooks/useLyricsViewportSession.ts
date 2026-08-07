"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";

export type LyricsEditorKey = "lyrics" | "translation";

type ViewportMetrics = {
  maxHeight: number;
};

type TextAnchor = {
  lineIndex: number;
  lineCount: number;
  paragraphIndex: number;
  paragraphLineOffset: number;
  lineRatio: number;
};

// Semantic text coordinates survive column swaps and layout-driven scroll-height changes.
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

const MIN_FALLBACK_HEIGHT = 240;
const EDITOR_KEYS: LyricsEditorKey[] = ["lyrics", "translation"];

const DEFAULT_METRICS: ViewportMetrics = {
  maxHeight: 760
};

export function useLyricsViewportSession({
  workspaceRef,
  scrollRef,
  getActiveEditorKey,
  getEditor
}: UseLyricsViewportSessionOptions) {
  const [metrics, setMetrics] = useState<ViewportMetrics>(DEFAULT_METRICS);
  const anchorRef = useRef<AnchorSnapshot | null>(null);
  const restoreSnapshotRef = useRef<AnchorSnapshot | null>(null);
  const restoreFrameRef = useRef(0);
  const restoreSettleFrameRef = useRef(0);
  const restorationPendingRef = useRef(false);
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
      // A replacement textarea inherits the prior selection instead of its default zero selection.
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
    if (restorationPendingRef.current) {
      restoreSnapshotRef.current = anchorRef.current;
    }
  }, [scrollRef, workspaceRef]);

  const restoreAnchor = useCallback(() => {
    if (!restorationPendingRef.current) {
      restoreSnapshotRef.current = anchorRef.current;
    }
    restorationPendingRef.current = true;
    window.cancelAnimationFrame(restoreFrameRef.current);
    window.cancelAnimationFrame(restoreSettleFrameRef.current);
    // Defer until layout commits, then keep capture suppressed for one settling frame.
    restoreFrameRef.current = window.requestAnimationFrame(() => {
      const finishRestore = () => {
        restoreSettleFrameRef.current = window.requestAnimationFrame(() => {
          restorationPendingRef.current = false;
          restoreSnapshotRef.current = null;
          captureAnchor();
        });
      };
      const scrollNode = scrollRef.current;
      const workspace = workspaceRef.current;
      const snapshot = restoreSnapshotRef.current;
      if (!scrollNode || !workspace || !snapshot) {
        restorationPendingRef.current = false;
        restoreSnapshotRef.current = null;
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
        finishRestore();
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
        finishRestore();
        return;
      }

      const centerRatio = sourceSnapshot.viewportCenterRatio ?? snapshot.viewportCenterRatio;
      if (centerRatio !== null) {
        const centerPosition = editorContentTop + editor.scrollHeight * centerRatio;
        scrollNode.scrollTop = clamp(centerPosition - scrollNode.clientHeight / 2, 0, maxScroll);
        finishRestore();
        return;
      }

      scrollNode.scrollTop = clamp(snapshot.scrollRatio * maxScroll, 0, maxScroll);
      finishRestore();
    });
  }, [captureAnchor, scrollRef, workspaceRef]);

  const measureViewport = useCallback(() => {
    const workspace = workspaceRef.current;
    if (!workspace || typeof window === "undefined") {
      return;
    }

    // Respect the nearest editor shell boundary rather than assuming the browser viewport is available.
    const bounds = workspace.closest<HTMLElement>('[data-lyrics-viewport-bounds="true"]');
    const workspaceRect = workspace.getBoundingClientRect();
    const workspaceTop = Math.max(0, workspaceRect.top);
    const parentBottom = bounds?.getBoundingClientRect().bottom ?? workspace.parentElement?.getBoundingClientRect().bottom;
    const availableBottom = parentBottom && parentBottom > workspaceTop
      ? Math.min(window.innerHeight - 20, parentBottom)
      : window.innerHeight - 20;
    const nextMetrics = calculateViewportMetrics(Math.floor(availableBottom - workspaceTop));

    setMetrics((current) => {
      if (current.maxHeight === nextMetrics.maxHeight) {
        return current;
      }

      return nextMetrics;
    });
  }, [workspaceRef]);

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
    const scrollNode = scrollRef.current;
    if (!scrollNode) {
      return;
    }

    const onScroll = () => {
      // Programmatic restoration must not overwrite the snapshot it is still consuming.
      if (!restorationPendingRef.current) {
        captureAnchor();
      }
    };
    scrollNode.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollNode.removeEventListener("scroll", onScroll);
  }, [captureAnchor, scrollRef]);

  const viewportHeight = metrics.maxHeight;

  useLayoutEffect(() => {
    restoreAnchor();
  }, [restoreAnchor, viewportHeight]);

  useEffect(() => () => {
    window.cancelAnimationFrame(restoreFrameRef.current);
    window.cancelAnimationFrame(restoreSettleFrameRef.current);
    restorationPendingRef.current = false;
    restoreSnapshotRef.current = null;
  }, []);

  return {
    mode: "immersive" as const,
    viewportHeight,
    captureAnchor,
    restoreAnchor
  };
}

function calculateViewportMetrics(availableHeight: number): ViewportMetrics {
  const maxHeight = Math.max(MIN_FALLBACK_HEIGHT, availableHeight);
  return { maxHeight };
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

  // When line counts diverge, map the same paragraph and relative line before falling back.
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
  // Prefer exact visual offset, then viewport center, and finally proportional scroll position.
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
  isConnectedEditorInWorkspace,
  resolveAnchoredScrollTop,
  resolveMappedTextAnchorRatio
};
