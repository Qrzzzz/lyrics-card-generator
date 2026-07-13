"use client";

import { Music2, Settings, Trash2, X } from "lucide-react";
import type { RefObject } from "react";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { createT } from "@/lib/i18n";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

export type EditorHeaderMode = "normal" | "examplesDocked";
export type EditorHeaderDensity = "normal" | "compact";

type EditorHeaderProps = {
  locale: Locale;
  t: ReturnType<typeof createT>;
  mode?: EditorHeaderMode;
  onOpenExamples: () => void;
  onClearAll: () => void;
  onOpenSettings: () => void;
  onCloseSurface?: () => void;
  settingsButtonRef?: RefObject<HTMLButtonElement | null>;
};

type EditorHeaderActionsProps = Pick<
  EditorHeaderProps,
  | "locale"
  | "onOpenExamples"
  | "onClearAll"
  | "onOpenSettings"
  | "onCloseSurface"
  | "settingsButtonRef"
> & {
  mode?: EditorHeaderMode;
  density?: EditorHeaderDensity;
  placement?: "header" | "stepper";
};

export function EditorHeader({
  locale,
  t,
  mode = "normal",
  onOpenExamples,
  onClearAll,
  onOpenSettings,
  onCloseSurface,
  settingsButtonRef
}: EditorHeaderProps) {
  return (
    <header
      className="editor-header glass-panel relative z-40 flex h-[var(--app-header-height)] min-w-0 max-w-full flex-col justify-center gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <img
          src="/app-icon.png"
          alt="Lyrics Card"
          className="editor-header__icon h-12 w-12 shrink-0 rounded-2xl shadow-lg sm:h-16 sm:w-16"
        />
        <div className="min-w-0">
          <h1 className="app-text-primary truncate text-xl font-black tracking-normal sm:text-3xl">
            {t("appTitle")}
          </h1>
          <p className="editor-header__subtitle app-text-subtle mt-1 truncate text-sm">{t("appSubtitle")}</p>
        </div>
      </div>
      <EditorHeaderActions
        locale={locale}
        mode={mode}
        onOpenExamples={onOpenExamples}
        onClearAll={onClearAll}
        onOpenSettings={onOpenSettings}
        onCloseSurface={onCloseSurface}
        settingsButtonRef={settingsButtonRef}
      />
    </header>
  );
}

export function EditorHeaderActions({
  locale,
  mode = "normal",
  density = "normal",
  placement = "header",
  onOpenExamples,
  onClearAll,
  onOpenSettings,
  onCloseSurface,
  settingsButtonRef
}: EditorHeaderActionsProps) {
  const aiCopy = getAIUiCopy(locale);
  const copy = settingsCopy[locale];
  const isDocked = mode === "examplesDocked";
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
        type="button"
        data-testid={isDocked ? "examples-close-button" : "examples-button"}
        aria-label={isDocked ? copy.cancel : undefined}
        onClick={isDocked ? onCloseSurface : onOpenExamples}
        className={cn(buttonClassName, isDocked && "examples-close-button")}
      >
        {isDocked ? (
          <X className="examples-close-button__icon h-5 w-5" />
        ) : (
          <>
            <Music2 className="h-4 w-4" />
            <span>{copy.example}</span>
          </>
        )}
      </button>
      <button
        type="button"
        data-testid="clear-all-button"
        onClick={onClearAll}
        aria-hidden={isDocked}
        tabIndex={isDocked ? -1 : undefined}
        className={cn(buttonClassName, isDocked && "pointer-events-none invisible")}
      >
        <Trash2 className="h-4 w-4" />
        <span>{copy.clearAll}</span>
      </button>
      <button
        ref={settingsButtonRef}
        type="button"
        data-testid="settings-button"
        onClick={() => onOpenSettings()}
        aria-hidden={isDocked}
        tabIndex={isDocked ? -1 : undefined}
        className={cn(buttonClassName, isDocked && "pointer-events-none invisible")}
      >
        <Settings className="h-4 w-4" />
        <span>{aiCopy.settings}</span>
      </button>
    </div>
  );
}
