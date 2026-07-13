"use client";

import { Music2, Settings, Trash2, X } from "lucide-react";
import type { RefObject } from "react";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { createT } from "@/lib/i18n";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";

export type EditorHeaderMode = "normal" | "examplesDocked";
export type EditorHeaderDensity = "normal" | "compact";

type EditorHeaderProps = {
  locale: Locale;
  t: ReturnType<typeof createT>;
  mode?: EditorHeaderMode;
  density?: EditorHeaderDensity;
  actionsOnly?: boolean;
  onOpenExamples: () => void;
  onClearAll: () => void;
  onOpenSettings: () => void;
  onCloseSurface?: () => void;
  settingsButtonRef?: RefObject<HTMLButtonElement | null>;
};

export function EditorHeader({
  locale,
  t,
  mode = "normal",
  density = "normal",
  actionsOnly = false,
  onOpenExamples,
  onClearAll,
  onOpenSettings,
  onCloseSurface,
  settingsButtonRef
}: EditorHeaderProps) {
  const aiCopy = getAIUiCopy(locale);
  const copy = settingsCopy[locale];
  const isDocked = mode === "examplesDocked";
  const isCompact = density === "compact" && !isDocked;

  return (
    <header
      data-density={density}
      className={[
        "editor-header glass-panel relative z-40 flex min-w-0 max-w-full flex-col justify-center rounded-lg sm:flex-row sm:items-center sm:justify-between",
        actionsOnly
          ? "editor-action-rail ml-auto min-h-12 w-fit gap-2 px-2 py-1.5"
          : isCompact ? "min-h-14 gap-2 px-3 py-2" : "h-[var(--app-header-height)] gap-3 px-4 py-3"
      ].join(" ")}
    >
      {!actionsOnly ? <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <img
          src="/app-icon.png"
          alt="Lyrics Card"
          className={isCompact
            ? "h-10 w-10 shrink-0 rounded-xl shadow-lg"
            : "editor-header__icon h-12 w-12 shrink-0 rounded-2xl shadow-lg sm:h-16 sm:w-16"}
        />
        <div className="min-w-0">
          <h1 className={isCompact
            ? "app-text-primary truncate text-xl font-black tracking-normal"
            : "app-text-primary truncate text-xl font-black tracking-normal sm:text-3xl"}
          >
            {t("appTitle")}
          </h1>
          {!isCompact ? <p className="editor-header__subtitle app-text-subtle mt-1 truncate text-sm">{t("appSubtitle")}</p> : null}
        </div>
      </div> : null}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid={isDocked ? "examples-close-button" : "examples-button"}
          aria-label={isDocked ? copy.cancel : undefined}
          onClick={isDocked ? onCloseSurface : onOpenExamples}
          className={[
            "app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold",
            isDocked ? "examples-close-button" : ""
          ].join(" ")}
        >
          {isDocked ? (
            <X className="examples-close-button__icon h-5 w-5" />
          ) : (
            <>
              <Music2 className="h-4 w-4" />
              {copy.example}
            </>
          )}
        </button>
        <button
          type="button"
          data-testid="clear-all-button"
          onClick={onClearAll}
          aria-hidden={isDocked}
          tabIndex={isDocked ? -1 : undefined}
          className={[
            "app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold",
            isDocked ? "pointer-events-none invisible" : ""
          ].join(" ")}
        >
          <Trash2 className="h-4 w-4" />
          {copy.clearAll}
        </button>
        <button
          ref={settingsButtonRef}
          type="button"
          data-testid="settings-button"
          onClick={() => onOpenSettings()}
          aria-hidden={isDocked}
          tabIndex={isDocked ? -1 : undefined}
          className={[
            "app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold",
            isDocked ? "pointer-events-none invisible" : ""
          ].join(" ")}
        >
          <Settings className="h-4 w-4" />
          {aiCopy.settings}
        </button>
      </div>
    </header>
  );
}
