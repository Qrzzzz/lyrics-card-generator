"use client";

import {
  ClipboardCheck,
  Languages,
  ListCollapse,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  TextSelect,
  TimerOff,
  Undo2
} from "lucide-react";
import type { ReactNode, Ref } from "react";
import type { LyricsWorkspaceCopy } from "@/components/editor/lyrics-workspace-copy";
import type { LyricsSidebarTab } from "@/lib/lyrics-workbench";
import { cn } from "@/lib/utils";

export type LyricsCommandIntent = "ai";

export function LyricsCommandBar({
  copy,
  activeTab,
  canKeepSelection,
  canUndo,
  canRedo,
  isAITranslating,
  showAITranslate,
  lyricsFetchAction,
  reviewAction,
  currentPosition,
  scopeLabel,
  sidebarExpanded,
  showSidebarToggle,
  sidebarToggleRef,
  onUndo,
  onRedo,
  onKeepSelection,
  onCleanPaste,
  onCollapseBlankLines,
  onStripLrc,
  onAITranslate,
  onToggleSidebar
}: {
  copy: LyricsWorkspaceCopy;
  activeTab: LyricsSidebarTab;
  canKeepSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isAITranslating: boolean;
  showAITranslate: boolean;
  lyricsFetchAction: ReactNode;
  reviewAction: ReactNode;
  currentPosition: string;
  scopeLabel: string;
  sidebarExpanded: boolean;
  showSidebarToggle: boolean;
  sidebarToggleRef?: Ref<HTMLButtonElement>;
  onUndo: () => void;
  onRedo: () => void;
  onKeepSelection: () => void;
  onCleanPaste: () => void;
  onCollapseBlankLines: () => void;
  onStripLrc: () => void;
  onAITranslate: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label={copy.commandBar}
      className="lyrics-command-bar grid min-h-11 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-1 pb-2"
      data-testid="lyrics-command-bar"
      data-active-tab={activeTab}
    >
      <div className="lyrics-command-group flex min-w-0 items-center gap-1 overflow-hidden">
        <CommandShortcut
          label={copy.keepSelection}
          testId="lyrics-command-keep-selection"
          onClick={onKeepSelection}
          disabled={!canKeepSelection}
          icon={<TextSelect className="size-3.5" />}
          emphasis
        />
        <span className="lyrics-command-separator mx-0.5 h-5 w-px" aria-hidden="true" />
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
        <span className="lyrics-command-separator mx-0.5 h-5 w-px" aria-hidden="true" />
        <CommandShortcut
          label={copy.cleanPaste}
          testId="lyrics-command-clean-paste"
          onClick={onCleanPaste}
          icon={<ClipboardCheck className="size-3.5" />}
        />
        <CommandShortcut
          label={copy.collapseBlankLines}
          testId="lyrics-command-collapse-blanks"
          onClick={onCollapseBlankLines}
          icon={<ListCollapse className="size-3.5" />}
        />
        <CommandShortcut
          label={copy.stripLrcShortcut}
          testId="lyrics-command-strip-lrc"
          onClick={onStripLrc}
          icon={<TimerOff className="size-3.5" />}
        />
        {showAITranslate ? (
          <CommandShortcut
            label={copy.aiShortcut}
            testId="lyrics-command-ai"
            onClick={onAITranslate}
            disabled={isAITranslating}
            icon={<Languages className={cn("size-3.5", isAITranslating && "animate-pulse")} />}
          />
        ) : null}
      </div>

      <div className="lyrics-command-group flex shrink-0 items-center gap-1">
        <LyricsStatusBar currentPosition={currentPosition} scopeLabel={scopeLabel} />
        <span className="lyrics-command-separator mx-0.5 hidden h-5 w-px min-[900px]:block" aria-hidden="true" />
        {lyricsFetchAction}
        {reviewAction}
        {showSidebarToggle ? (
          <>
            <span className="lyrics-command-separator mx-0.5 h-5 w-px" aria-hidden="true" />
            <CommandIconButton
              label={sidebarExpanded ? copy.closeDrawer : copy.openDrawer}
              testId="lyrics-command-sidebar-toggle"
              onClick={onToggleSidebar}
              pressed={sidebarExpanded}
              buttonRef={sidebarToggleRef}
              icon={sidebarExpanded
                ? <PanelRightClose className="size-3.5" />
                : <PanelRightOpen className="size-3.5" />}
            />
          </>
        ) : null}
      </div>
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
      <span className="app-text-muted max-w-36 truncate font-medium" data-testid="lyrics-command-position">
        {currentPosition}
      </span>
      <span className="app-text-subtle hidden max-w-32 truncate min-[1180px]:inline" data-testid="lyrics-command-scope">
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
      title={label}
      aria-label={label}
      data-testid={testId}
    >
      {icon}
      <span className="hidden min-[1080px]:inline">{label}</span>
    </button>
  );
}
