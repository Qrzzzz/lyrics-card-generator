"use client";

import { motion } from "framer-motion";
import {
  Eraser,
  Languages,
  X
} from "lucide-react";
import {
  type CSSProperties,
  type Ref,
  type ReactNode
} from "react";
import type { LyricsCommandIntent } from "@/components/editor/LyricsCommandBar";
import {
  LyricsCleanupPanel,
  type LyricsSidebarPanelProps,
  LyricsTranslationPanel
} from "@/components/editor/LyricsSidebarPanels";
import {
  LYRICS_SIDEBAR_TABS,
  type LyricsSidebarPage,
  useLyricsSidebarNavigation
} from "@/components/editor/hooks/useLyricsSidebarNavigation";
import type { LyricsWorkspaceCopy } from "@/components/editor/lyrics-workspace-copy";
import type { LyricsSidebarTab } from "@/lib/lyrics-workbench";
import {
  reducedMotionTransition,
  sidebarPageTransition
} from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

type LyricsSidebarProps = LyricsSidebarPanelProps & {
  activeTab: LyricsSidebarTab;
  open: boolean;
  mobileDrawer: boolean;
  feedback: { message: string; canUndo: boolean } | null;
  focusIntent: LyricsCommandIntent | null;
  aiPanel?: ReactNode;
  onTabChange: (tab: LyricsSidebarTab) => void;
  onCloseDrawer: () => void;
  onIntentHandled: () => void;
  onUndo: () => void;
  onCloseAITranslate: () => void;
  onCancelAITranslate: () => void;
};

const SIDEBAR_PAGE_INDEX: Record<LyricsSidebarPage, number> = {
  cleanup: 0,
  translation: 1,
  ai: 2
};

export function LyricsSidebar(props: LyricsSidebarProps) {
  const {
    copy,
    activeTab,
    open,
    mobileDrawer,
    feedback,
    focusIntent,
    aiPanel,
    isAITranslating,
    onTabChange,
    onCloseDrawer,
    onIntentHandled,
    onCloseAITranslate,
    onCancelAITranslate,
    onUndo
  } = props;
  const {
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
  } = useLyricsSidebarNavigation({
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
  });

  return (
    <aside
      id="lyrics-workspace-sidebar"
      aria-label={copy.sidebar}
      aria-modal={mobileDrawer ? true : undefined}
      role={mobileDrawer ? "dialog" : undefined}
      hidden={!open}
      onKeyDown={onDrawerKeyDown}
      className={cn(
        "lyrics-sidebar app-text-muted h-full min-h-0 min-w-0 overflow-hidden",
        mobileDrawer && "lyrics-sidebar--drawer"
      )}
      data-testid="lyrics-sidebar"
      data-mobile-drawer={mobileDrawer ? "true" : "false"}
      data-active-tab={activeTab}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="lyrics-sidebar-header flex shrink-0 items-center gap-2 border-b border-[rgb(var(--panel-border))] p-2">
          <div
            role="tablist"
            aria-label={copy.sidebar}
            className="segmented-control lyrics-sidebar-tabs grid min-w-0 flex-1 grid-cols-2"
            style={{
              "--segmented-count": 2,
              "--segmented-active-translate": activeTab === "cleanup" ? "0%" : "100%"
            } as CSSProperties}
          >
            <span className="segmented-control__active-indicator" aria-hidden="true" />
            {LYRICS_SIDEBAR_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`lyrics-sidebar-panel-${tab}`}
                id={`lyrics-sidebar-tab-${tab}`}
                className={cn(
                  "segmented-control__item lyrics-sidebar-tab control-focus relative flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition",
                  activeTab === tab
                    ? "app-text-primary"
                    : "app-text-subtle"
                )}
                data-selected={activeTab === tab ? "true" : "false"}
                onClick={() => onTabChange(tab)}
                onKeyDown={(event) => onTabKeyDown(event, tab)}
                tabIndex={activeTab === tab ? 0 : -1}
                data-testid={`lyrics-sidebar-tab-${tab}`}
              >
                {tabIcon(tab, "size-3.5")}
                <span className="truncate">{tabLabel(copy, tab)}</span>
              </button>
            ))}
          </div>
          {mobileDrawer ? (
            <SidebarIconButton
              label={copy.closeDrawer}
              testId="lyrics-sidebar-close-drawer"
              onClick={onCloseDrawer}
              icon={<X className="size-4" />}
              buttonRef={closeDrawerButtonRef}
            />
          ) : null}
        </header>

        {feedback ? (
          <div
            className="status-info mx-2 mt-2 flex shrink-0 items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] leading-relaxed"
            role="status"
            aria-live="polite"
            data-testid="lyrics-operation-feedback"
          >
            <span className="min-w-0 flex-1">{feedback.message}</span>
            {feedback.canUndo ? (
              <button
                type="button"
                className="control-focus shrink-0 rounded px-1 font-semibold underline underline-offset-2"
                onClick={onUndo}
              >
                {copy.undoNow}
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          className="min-h-0 flex-1 overflow-hidden"
          data-testid="lyrics-sidebar-panels"
        >
          <div
            ref={viewportRef}
            tabIndex={-1}
            className="relative h-full min-h-0 overflow-hidden focus:outline-none"
            data-testid="lyrics-translation-page-viewport"
            data-sidebar-page={activePage}
            data-translation-page={aiPanel ? "ai" : "home"}
            data-reduced-motion={reducedMotion ? "true" : "false"}
          >
            <SidebarDeckPage
              page="cleanup"
              activePage={activePage}
              transitionFrom={visibleTransitionFrom}
              reducedMotion={reducedMotion}
              id="lyrics-sidebar-panel-cleanup"
              labelledBy="lyrics-sidebar-tab-cleanup"
              testId="lyrics-sidebar-panel-cleanup"
              className="overflow-x-hidden overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]"
              onEntered={focusEnteredPage}
            >
              <LyricsCleanupPanel {...props} />
            </SidebarDeckPage>
            <SidebarDeckPage
              page="translation"
              activePage={activePage}
              transitionFrom={visibleTransitionFrom}
              reducedMotion={reducedMotion}
              id={!aiPanel ? "lyrics-sidebar-panel-translation" : undefined}
              labelledBy="lyrics-sidebar-tab-translation"
              testId="lyrics-translation-home-page"
              className="overflow-x-hidden overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]"
              onEntered={focusEnteredPage}
            >
              <LyricsTranslationPanel {...props} aiButtonRef={aiButtonRef} />
            </SidebarDeckPage>
            <SidebarDeckPage
              page="ai"
              activePage={activePage}
              transitionFrom={visibleTransitionFrom}
              reducedMotion={reducedMotion}
              id={aiPanel ? "lyrics-sidebar-panel-translation" : undefined}
              labelledBy="lyrics-sidebar-tab-translation"
              testId={renderedAiPanel ? "lyrics-translation-ai-page" : undefined}
              className="overflow-hidden"
              pageRef={aiPageRef}
              onEntered={focusEnteredPage}
            >
              {renderedAiPanel}
            </SidebarDeckPage>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarDeckPage({
  page,
  activePage,
  transitionFrom,
  reducedMotion,
  id,
  labelledBy,
  testId,
  className,
  pageRef,
  onEntered,
  children
}: {
  page: LyricsSidebarPage;
  activePage: LyricsSidebarPage;
  transitionFrom: LyricsSidebarPage | null;
  reducedMotion: boolean;
  id?: string;
  labelledBy: string;
  testId?: string;
  className: string;
  pageRef?: Ref<HTMLElement>;
  onEntered: (page: LyricsSidebarPage) => void;
  children: ReactNode;
}) {
  const active = page === activePage;
  const exiting = page === transitionFrom;
  // Active and outgoing pages remain visible during transitions; other mounted pages stay hidden.
  const visible = active || exiting;
  const pageOffset = SIDEBAR_PAGE_INDEX[page] - SIDEBAR_PAGE_INDEX[activePage];

  return (
    <motion.section
      ref={pageRef}
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      aria-hidden={active ? undefined : true}
      inert={active ? undefined : true}
      hidden={!visible}
      initial={false}
      animate={{
        opacity: reducedMotion ? (active ? 1 : 0) : (visible ? 1 : 0),
        x: reducedMotion
          ? "0%"
          : pageOffset < 0
            ? "-100%"
            : pageOffset > 0
              ? "100%"
              : "0%"
      }}
      transition={reducedMotion ? reducedMotionTransition : sidebarPageTransition}
      onAnimationComplete={() => {
        if (active) onEntered(page);
      }}
      className={cn(
        "absolute inset-0 h-full min-h-0",
        className
      )}
      data-lyrics-sidebar-page={page}
      data-testid={testId}
      data-page-active={active ? "true" : "false"}
      style={{
        pointerEvents: active ? "auto" : "none",
        zIndex: active ? 2 : exiting ? 1 : 0
      }}
    >
      {children}
    </motion.section>
  );
}

function SidebarIconButton({
  label,
  icon,
  onClick,
  testId,
  active = false,
  badge = 0,
  buttonRef
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  testId?: string;
  active?: boolean;
  badge?: number;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={cn(
        "app-button control-focus relative flex size-9 items-center justify-center rounded-md",
        active && "border-[var(--control-selected-border)] bg-[rgb(var(--button-bg-hover))]"
      )}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-testid={testId}
    >
      {icon}
      {badge > 0 ? (
        <span className="absolute right-0.5 top-0.5 flex min-h-3 min-w-3 items-center justify-center rounded-full bg-[var(--control-focus-border)] px-0.5 text-[8px] font-bold text-white">
          {Math.min(9, badge)}
        </span>
      ) : null}
    </button>
  );
}

function tabLabel(copy: LyricsWorkspaceCopy, tab: LyricsSidebarTab) {
  if (tab === "cleanup") return copy.cleanupTab;
  return copy.translationTab;
}

function tabIcon(tab: LyricsSidebarTab, className = "size-4") {
  if (tab === "cleanup") return <Eraser className={className} />;
  return <Languages className={className} />;
}
