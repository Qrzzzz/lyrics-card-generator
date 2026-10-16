"use client";
import { Languages, Search, PanelRightClose, PanelRightOpen, Redo2, Undo2 } from "lucide-react";
import type { ReactNode, Ref } from "react";
import type { LyricsWorkspaceCopy } from "@/components/editor/lyrics-workspace-copy";
import type { LyricsSidebarTab } from "@/lib/lyrics-workbench";
import { cn } from "@/lib/utils";
export type LyricsCommandIntent = "ai";
export function LyricsCommandBar({
  copy,
  activeTab,
  canUndo,
  canRedo,
  isAITranslating,
  showAITranslate,
  lyricsFetchAction,
  currentPosition,
  scopeLabel,
  sidebarExpanded,
  showSidebarToggle,
  sidebarToggleRef,
  onUndo,
  onRedo,
  onAITranslate,
  onToggleSidebar,
  onSearch,
  searchLabel,
  sidebarLabel
}: {
  copy: LyricsWorkspaceCopy;
  activeTab: LyricsSidebarTab;
  canUndo: boolean;
  canRedo: boolean;
  isAITranslating: boolean;
  showAITranslate: boolean;
  lyricsFetchAction: ReactNode;
  currentPosition: string;
  scopeLabel: string;
  sidebarExpanded: boolean;
  showSidebarToggle: boolean;
  sidebarToggleRef?: Ref<HTMLButtonElement>;
  onUndo: () => void;
  onRedo: () => void;
  onAITranslate: () => void;
  onToggleSidebar: () => void;
  onSearch: () => void;
  searchLabel: string;
  sidebarLabel: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label={copy.commandBar}
      className="lyrics-command-bar flex min-h-11 shrink-0 flex-wrap items-center gap-1 px-1 pb-2"
      data-testid="lyrics-command-bar"
      data-active-tab={activeTab}
    >
      <CommandIconButton
        label={copy.undo}
        testId="lyrics-command-undo"
        disabled={!canUndo}
        onClick={onUndo}
        icon={<Undo2 className="size-3.5" />}
      />
      <CommandIconButton
        label={copy.redo}
        testId="lyrics-command-redo"
        disabled={!canRedo}
        onClick={onRedo}
        icon={<Redo2 className="size-3.5" />}
      />
      <span className="lyrics-command-separator mx-1 h-5 w-px" aria-hidden="true" />
      {lyricsFetchAction}
      {showAITranslate ? (
        <CommandShortcut
          label={copy.aiShortcut}
          testId="lyrics-command-ai"
          onClick={onAITranslate}
          disabled={isAITranslating}
          icon={<Languages className="size-3.5" />}
        />
      ) : null}
      <CommandShortcut
        label={searchLabel}
        testId="lyrics-command-search"
        onClick={onSearch}
        icon={<Search className="size-3.5" />}
      />
      <span className="min-w-0 flex-1" />
      <LyricsStatusBar currentPosition={currentPosition} scopeLabel={scopeLabel} />
      {showSidebarToggle ? (
        <CommandIconButton
          label={sidebarLabel}
          testId="lyrics-command-sidebar-toggle"
          onClick={onToggleSidebar}
          pressed={sidebarExpanded}
          buttonRef={sidebarToggleRef}
          icon={
            sidebarExpanded ? (
              <PanelRightClose className="size-3.5" />
            ) : (
              <PanelRightOpen className="size-3.5" />
            )
          }
        />
      ) : null}
    </div>
  );
}

export function LyricsStatusBar({
  currentPosition,
  scopeLabel
}: {
  currentPosition: string;
  scopeLabel: string;
}) {
  return (
    <div
      className="lyrics-status-bar hidden min-w-0 max-w-[18rem] shrink items-center gap-2 px-1.5 text-[10px] min-[900px]:flex"
      data-testid="lyrics-status-bar"
      title={`${currentPosition} · ${scopeLabel}`}
    >
      <span
        className="app-text-muted max-w-36 truncate font-medium"
        data-testid="lyrics-command-position"
      >
        {currentPosition}
      </span>
      <span
        className="app-text-subtle hidden max-w-32 truncate min-[1180px]:inline"
        data-testid="lyrics-command-scope"
      >
        {scopeLabel}
      </span>
    </div>
  );
}

function CommandIconButton({
  label,
  icon,
  testId,
  onClick,
  disabled = false,
  pressed,
  buttonRef
}: {
  label: string;
  icon: React.ReactNode;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="app-button lyrics-command-button lyrics-command-button--icon control-focus flex size-8 items-center justify-center rounded-md disabled:cursor-default disabled:opacity-35"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={pressed}
      aria-controls={pressed === undefined ? undefined : "lyrics-workspace-sidebar"}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      {icon}
    </button>
  );
}

function CommandShortcut({
  label,
  icon,
  testId,
  onClick,
  disabled = false,
  emphasis = false
}: {
  label: string;
  icon: React.ReactNode;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "app-button lyrics-command-button control-focus flex h-8 items-center gap-1.5 rounded-md px-2 text-[10px] font-semibold disabled:cursor-wait disabled:opacity-45",
        emphasis && "lyrics-command-button--accent"
      )}
      onClick={onClick}
      disabled={disabled}
      title={testId === "lyrics-command-search" ? `${label} (Ctrl+K)` : label}
      aria-keyshortcuts={testId === "lyrics-command-search" ? "Control+k Meta+k" : undefined}
      aria-label={label}
      data-testid={testId}
    >
      {icon}
      <span className="hidden min-[1080px]:inline">{label}</span>
    </button>
  );
}
