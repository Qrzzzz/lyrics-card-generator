"use client";

import {
  Eraser,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Search,
  Sparkles,
  Undo2
} from "lucide-react";
import type { LyricsWorkspaceCopy } from "@/components/editor/lyrics-workspace-copy";
import type { LyricsSidebarTab } from "@/lib/lyrics-workbench";
import { cn } from "@/lib/utils";

export type LyricsCommandIntent = "blank" | "find" | "ai" | "budget";

export function LyricsCommandBar({
  copy,
  activeTab,
  activeTabLabel,
  currentPosition,
  scopeLabel,
  lineBudget,
  canUndo,
  canRedo,
  isAITranslating,
  sidebarExpanded,
  onUndo,
  onRedo,
  onOpen,
  onToggleSidebar
}: {
  copy: LyricsWorkspaceCopy;
  activeTab: LyricsSidebarTab;
  activeTabLabel: string;
  currentPosition: string;
  scopeLabel: string;
  lineBudget: { total: number; max: number; over: boolean };
  canUndo: boolean;
  canRedo: boolean;
  isAITranslating: boolean;
  sidebarExpanded: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpen: (tab: LyricsSidebarTab, intent: LyricsCommandIntent) => void;
  onToggleSidebar: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label={copy.commandBar}
      className="lyrics-command-bar flex min-h-11 shrink-0 items-center gap-1.5 border-b border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] px-2"
      data-testid="lyrics-command-bar"
      data-active-tab={activeTab}
    >
      <div className="lyrics-command-bar__context flex min-w-0 items-center gap-2">
        <span className="app-text-primary truncate text-xs font-semibold" data-testid="lyrics-command-active-tab">
          {activeTabLabel}
        </span>
        <span className="app-text-subtle hidden truncate text-[10px] min-[760px]:inline" data-testid="lyrics-command-position">
          {currentPosition}
        </span>
        <span className="app-text-subtle hidden truncate text-[10px] min-[1180px]:inline" data-testid="lyrics-command-scope">
          {scopeLabel}
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
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
        <span className="mx-0.5 h-5 w-px bg-[rgb(var(--panel-border))]" aria-hidden="true" />
        <CommandShortcut
          label={copy.blankShortcut}
          testId="lyrics-command-blank"
          onClick={() => onOpen("cleanup", "blank")}
          icon={<Eraser className="size-3.5" />}
        />
        <CommandShortcut
          label={copy.findShortcut}
          testId="lyrics-command-find"
          onClick={() => onOpen("cleanup", "find")}
          icon={<Search className="size-3.5" />}
        />
        <CommandShortcut
          label={copy.aiShortcut}
          testId="lyrics-command-ai"
          onClick={() => onOpen("translation", "ai")}
          disabled={isAITranslating}
          icon={<Sparkles className={cn("size-3.5", isAITranslating && "animate-pulse")} />}
        />
        <button
          type="button"
          className={cn(
            "app-button control-focus flex h-8 min-w-12 items-center justify-center rounded-md px-2 font-mono text-[10px] font-bold",
            lineBudget.over && "status-danger"
          )}
          onClick={() => onOpen("review", "budget")}
          aria-label={`${copy.lineBudgetLabel}: ${lineBudget.total}/${lineBudget.max}`}
          title={copy.lineBudgetLabel}
          data-testid="lyrics-command-budget"
        >
          {lineBudget.total}/{lineBudget.max}
        </button>
        <CommandIconButton
          label={sidebarExpanded ? copy.collapseSidebar : copy.expandSidebar}
          testId="lyrics-command-sidebar-toggle"
          onClick={onToggleSidebar}
          pressed={sidebarExpanded}
          icon={sidebarExpanded
            ? <PanelRightClose className="size-3.5" />
            : <PanelRightOpen className="size-3.5" />}
        />
      </div>
    </div>
  );
}

function CommandIconButton({
  label,
  icon,
  testId,
  onClick,
  disabled = false,
  pressed
}: {
  label: string;
  icon: React.ReactNode;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className="app-button control-focus flex size-8 items-center justify-center rounded-md disabled:cursor-default disabled:opacity-35"
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
  disabled = false
}: {
  label: string;
  icon: React.ReactNode;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="app-button control-focus flex h-8 items-center gap-1.5 rounded-md px-2 text-[10px] font-semibold disabled:cursor-wait disabled:opacity-45"
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
