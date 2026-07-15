"use client";

import { Music2, Settings, Trash2 } from "lucide-react";
import type { RefObject } from "react";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

export type EditorHeaderDensity = "normal" | "compact";

type EditorHeaderActionsProps = {
  locale: Locale;
  onOpenExamples: () => void;
  onClearAll: () => void;
  onOpenSettings: () => void;
  examplesButtonRef?: RefObject<HTMLButtonElement | null>;
  settingsButtonRef?: RefObject<HTMLButtonElement | null>;
  density?: EditorHeaderDensity;
  placement?: "header" | "stepper";
};

export function EditorHeaderActions({
  locale,
  density = "normal",
  placement = "header",
  onOpenExamples,
  onClearAll,
  onOpenSettings,
  examplesButtonRef,
  settingsButtonRef
}: EditorHeaderActionsProps) {
  const aiCopy = getAIUiCopy(locale);
  const copy = settingsCopy[locale];
  const isCompact = density === "compact";
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
        onClick={onOpenExamples}
        className={buttonClassName}
      >
        <Music2 className="h-4 w-4" />
        <span>{copy.example}</span>
      </button>
      <button
        type="button"
        data-testid="clear-all-button"
        onClick={onClearAll}
        className={buttonClassName}
      >
        <Trash2 className="h-4 w-4" />
        <span>{copy.clearAll}</span>
      </button>
      <button
        ref={settingsButtonRef}
        type="button"
        data-testid="settings-button"
        onClick={() => onOpenSettings()}
        className={buttonClassName}
      >
        <Settings className="h-4 w-4" />
        <span>{aiCopy.settings}</span>
      </button>
    </div>
  );
}
