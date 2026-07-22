"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  __internalLyricsWorkspaceLayout,
  resolveLyricsWorkspaceSplit
} from "@/lib/lyrics-workspace-layout";

const LYRICS_WORKSPACE_DESKTOP_QUERY = "(min-width: 900px)";

export function useLyricsWorkspaceSplit() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [matchesDesktopQuery, setMatchesDesktopQuery] = useState(false);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let frame = 0;
    const mediaQuery = window.matchMedia(LYRICS_WORKSPACE_DESKTOP_QUERY);
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setViewportWidth(viewport.getBoundingClientRect().width);
        setMatchesDesktopQuery(mediaQuery.matches);
      });
    };

    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    mediaQuery.addEventListener("change", update);
    update();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      mediaQuery.removeEventListener("change", update);
    };
  }, []);

  const geometry = resolveLyricsWorkspaceSplit(viewportWidth);
  const isDesktop = matchesDesktopQuery && viewportWidth >= __internalLyricsWorkspaceLayout.MIN_SIDE_BY_SIDE_WIDTH;

  return {
    viewportRef,
    geometry,
    isDesktop
  };
}
