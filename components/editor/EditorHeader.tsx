"use client";

import { History as HistoryIcon, Loader2, Music2, Save, Settings, Trash2 } from "lucide-react";
import type { RefObject } from "react";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import { importHistoryCopy } from "@/lib/import-history-copy";
import type { ManualSaveButtonState } from "@/lib/import-history";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

export type EditorHeaderDensity = "normal" | "compact";

type EditorHeaderActionsProps = {
  locale: Locale;
  onOpenExamples: () => void;
  onOpenHistory?: () => void;
  onManualSave?: () => void;
  manualSaveState?: ManualSaveButtonState;
  manualSaveDisabled?: boolean;
  onClearAll: () => void;
  onOpenSettings: () => void;
  examplesButtonRef?: RefObject<HTMLButtonElement | null>;
  historyButtonRef?: RefObject<HTMLButtonElement | null>;
  settingsButtonRef?: RefObject<HTMLButtonElement | null>;
  density?: EditorHeaderDensity;
  placement?: "header" | "stepper";
};

export function EditorHeaderActions({
  locale,
  density = "normal",
  placement = "header",
  onOpenExamples,
  onOpenHistory,
  onManualSave,
  manualSaveState = "create",
  manualSaveDisabled = false,
  onClearAll,
  onOpenSettings,
  examplesButtonRef,
  historyButtonRef,
  settingsButtonRef
}: EditorHeaderActionsProps) {
  const aiCopy = getAIUiCopy(locale);
  const copy = settingsCopy[locale];
  const isCompact = density === "compact";
  const historyCopy = importHistoryCopy[locale];
  const manualSaveLabel = manualSaveState === "saving"
    ? historyCopy.manualSaveSavingLabel
    : manualSaveState === "current"
      ? historyCopy.manualSaveCurrentLabel
      : manualSaveState === "update"
        ? historyCopy.manualSaveUpdateLabel
        : manualSaveState === "unavailable"
          ? historyCopy.manualSaveUnavailableLabel
          : historyCopy.manualSaveCreateLabel;
  const buttonClassName = cn(
    "app-button inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold",
    isCompact ? "h-9 px-2.5" : "h-10 px-3"
  );

  return (
    <div
      data-testid="editor-header-actions"
      data-placement={placement}
      className={cn(
        "editor-header-actions flex shrink-0 flex-wrap items-center",
        isCompact ? "gap-2" : "gap-3",
        placement === "stepper" && "editor-header-actions--stepper"
      )}
    >
      <button
        ref={examplesButtonRef}
        type="button"
        data-testid="examples-button"
        aria-label={copy.example}
        title={copy.example}
        onClick={onOpenExamples}
        className={buttonClassName}
      >
        <Music2 className="h-4 w-4" aria-hidden="true" />
        <span>{copy.example}</span>
      </button>
      {onOpenHistory ? (
        <button
          ref={historyButtonRef}
          type="button"
          data-testid="history-button"
          aria-label={historyCopy.entry}
          title={historyCopy.entry}
          onClick={onOpenHistory}
          className={buttonClassName}
        >
          <HistoryIcon className="h-4 w-4" aria-hidden="true" />
          <span>{historyCopy.entry}</span>
        </button>
      ) : null}
      {onManualSave ? (
        <button
          type="button"
          data-testid="manual-save-button"
          data-manual-save-state={manualSaveState}
          aria-label={manualSaveLabel}
          aria-busy={manualSaveState === "saving"}
          title={manualSaveLabel}
          disabled={manualSaveDisabled || manualSaveState === "saving"}
          onClick={onManualSave}
          className={cn(buttonClassName, "editor-header-actions__icon-only p-0", isCompact ? "w-9" : "w-10")}
        >
          {manualSaveState === "saving" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      ) : null}
      <button
        type="button"
        data-testid="clear-all-button"
        aria-label={copy.clearAll}
        title={copy.clearAll}
        onClick={onClearAll}
        className={buttonClassName}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        <span>{copy.clearAll}</span>
      </button>
      <button
        ref={settingsButtonRef}
        type="button"
        data-testid="settings-button"
        aria-label={aiCopy.settings}
        title={aiCopy.settings}
        onClick={() => onOpenSettings()}
        className={buttonClassName}
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
        <span>{aiCopy.settings}</span>
      </button>
    </div>
  );
}
