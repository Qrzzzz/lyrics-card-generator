"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import type { LyricsCommandIntent } from "@/components/editor/LyricsCommandBar";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import type { LyricsSidebarTab } from "@/lib/lyrics-workbench";

export const LYRICS_SIDEBAR_TABS: LyricsSidebarTab[] = ["cleanup", "translation"];

export type LyricsSidebarPage = "cleanup" | "translation" | "ai";

type UseLyricsSidebarNavigationOptions = {
  activeTab: LyricsSidebarTab;
  open: boolean;
  mobileDrawer: boolean;
  focusIntent: LyricsCommandIntent | null;
  aiPanel?: ReactNode;
  isAITranslating: boolean;
  onTabChange: (tab: LyricsSidebarTab) => void;
  onCloseDrawer: () => void;
  onIntentHandled: () => void;
  onCloseAITranslate: () => void;
  onCancelAITranslate: () => void;
};

function resolveSidebarPage(
  activeTab: LyricsSidebarTab,
  aiPanel: ReactNode | undefined
): LyricsSidebarPage {
  if (activeTab === "cleanup") return "cleanup";
  return aiPanel ? "ai" : "translation";
}

export function useLyricsSidebarNavigation({
  activeTab,
  open,
  mobileDrawer,
  focusIntent,
  aiPanel,
  isAITranslating,
  onTabChange,
  onCloseDrawer,
  onIntentHandled,
  onCloseAITranslate,
  onCancelAITranslate
}: UseLyricsSidebarNavigationOptions) {
  const closeDrawerButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerOpenRef = useRef(false);
  const reducedMotion = useAppReducedMotion();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const aiPageRef = useRef<HTMLElement | null>(null);
  const aiButtonRef = useRef<HTMLButtonElement | null>(null);
  const activePage = resolveSidebarPage(activeTab, aiPanel);
  const previousPageRef = useRef<LyricsSidebarPage>(activePage);
  const retainedAiPanelRef = useRef<ReactNode>(aiPanel);
  const [transitionFrom, setTransitionFrom] = useState<LyricsSidebarPage | null>(null);
  const pendingFocusRef = useRef<"translation" | "ai" | null>(null);
  const pageChangingFrom = previousPageRef.current === activePage
    ? null
    : previousPageRef.current;
  const visibleTransitionFrom = transitionFrom ?? pageChangingFrom;

  if (aiPanel) retainedAiPanelRef.current = aiPanel;
  const renderedAiPanel = aiPanel ?? (
    pageChangingFrom === "ai" || transitionFrom === "ai"
      ? retainedAiPanelRef.current
      : null
  );

  const focusAiPagePrimary = useCallback(() => {
    const target = aiPageRef.current?.querySelector<HTMLButtonElement>(
      '[data-testid="ai-translate-run-page"][data-page-active="true"] [data-testid="lyrics-ai-run-page-back"], [data-testid="lyrics-ai-page-back"]'
    );
    target?.focus({ preventScroll: true });
    return Boolean(target);
  }, []);

  const focusEnteredPage = useCallback((page: LyricsSidebarPage) => {
    if (page !== activePage) return;
    setTransitionFrom(null);
    if (pendingFocusRef.current === "ai" && page === "ai") {
      pendingFocusRef.current = null;
      focusAiPagePrimary();
      if (focusIntent === "ai") onIntentHandled();
      return;
    }
    if (pendingFocusRef.current === "translation" && page === "translation") {
      pendingFocusRef.current = null;
      aiButtonRef.current?.focus({ preventScroll: true });
    }
  }, [activePage, focusAiPagePrimary, focusIntent, onIntentHandled]);

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: LyricsSidebarTab) {
    const currentIndex = LYRICS_SIDEBAR_TABS.indexOf(tab);
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % LYRICS_SIDEBAR_TABS.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + LYRICS_SIDEBAR_TABS.length) % LYRICS_SIDEBAR_TABS.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? LYRICS_SIDEBAR_TABS.length - 1
            : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = LYRICS_SIDEBAR_TABS[nextIndex];
    onTabChange(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById(`lyrics-sidebar-tab-${nextTab}`)?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    const drawerOpen = open && mobileDrawer;
    const wasOpen = drawerOpenRef.current;
    drawerOpenRef.current = drawerOpen;
    if (!drawerOpen || wasOpen || focusIntent) return;
    const frame = window.requestAnimationFrame(() => {
      closeDrawerButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusIntent, mobileDrawer, open]);

  useLayoutEffect(() => {
    const previousPage = previousPageRef.current;
    if (previousPage === activePage) return;
    previousPageRef.current = activePage;
    setTransitionFrom(previousPage);

    const activeElement = document.activeElement;
    const contentHadFocus = activeElement instanceof HTMLElement && Boolean(
      activeElement.closest("[data-lyrics-sidebar-page]")
    );
    if (contentHadFocus) {
      pendingFocusRef.current = activePage === "ai"
        ? "ai"
        : activePage === "translation"
          ? "translation"
          : null;
      viewportRef.current?.focus({ preventScroll: true });
    } else if (focusIntent === "ai" && activePage === "ai") {
      pendingFocusRef.current = "ai";
    }

    if (activePage === "ai") aiPageRef.current?.scrollTo({ top: 0 });
  }, [activePage, focusIntent]);

  useEffect(() => {
    if (focusIntent !== "ai" || activePage !== "ai" || pendingFocusRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      focusAiPagePrimary();
      onIntentHandled();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePage, focusAiPagePrimary, focusIntent, onIntentHandled]);

  useEffect(() => {
    if (!reducedMotion || !transitionFrom) return;
    const frame = window.requestAnimationFrame(() => focusEnteredPage(activePage));
    return () => window.cancelAnimationFrame(frame);
  }, [activePage, focusEnteredPage, reducedMotion, transitionFrom]);

  function onDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!mobileDrawer) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const activeRunPageBack = event.currentTarget.querySelector<HTMLButtonElement>(
        '[data-testid="ai-translate-run-page"][data-page-active="true"] [data-testid="lyrics-ai-run-page-back"]'
      );
      if (activeRunPageBack) {
        activeRunPageBack.click();
        return;
      }
      if (aiPanel) {
        if (isAITranslating) onCancelAITranslate();
        onCloseAITranslate();
        return;
      }
      onCloseDrawer();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
    )].filter((node) => (
      node.tabIndex >= 0 &&
      !node.closest("[hidden], [inert]") &&
      node.getClientRects().length > 0
    ));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  return {
    activePage,
    aiButtonRef,
    aiPageRef,
    closeDrawerButtonRef,
    focusEnteredPage,
    onDrawerKeyDown,
    onTabKeyDown,
    reducedMotion,
    renderedAiPanel,
    viewportRef,
    visibleTransitionFrom
  };
}
