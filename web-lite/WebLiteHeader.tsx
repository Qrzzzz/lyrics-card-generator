"use client";

import { Trash2 } from "lucide-react";
import type { createT } from "@/lib/i18n";
import type { WebLiteCopy, WebLiteLocale } from "@/web-lite/copy";

export function WebLiteHeader({
  locale,
  t,
  copy,
  onLocaleChange,
  onClearAll
}: {
  locale: WebLiteLocale;
  t: ReturnType<typeof createT>;
  copy: WebLiteCopy;
  onLocaleChange: (locale: WebLiteLocale) => void;
  onClearAll: () => void;
}) {
  return (
    <header className="glass-panel relative z-40 flex h-[var(--app-header-height)] min-w-0 max-w-full flex-col justify-center gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <img
          src="./public/app-icon.png"
          alt="Lyrics Card"
          className="h-12 w-12 shrink-0 rounded-2xl border border-[rgb(var(--panel-border))] shadow-lg sm:h-16 sm:w-16"
        />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="app-text-primary truncate text-xl font-black tracking-normal sm:text-3xl">{t("appTitle")}</h1>
            <span className="shrink-0 rounded-full border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--app-accent)] sm:text-[11px]">
              {copy.badge}
            </span>
          </div>
          <p className="app-text-subtle mt-1 truncate text-sm">{t("appSubtitle")}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
        <div
          role="radiogroup"
          aria-label={copy.language}
          className="segmented-control grid h-10 grid-cols-2 rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] p-1"
        >
          {(["zh", "en"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={locale === option}
              onClick={() => onLocaleChange(option)}
              className={`control-focus min-w-12 rounded-md px-3 text-xs font-bold transition ${
                locale === option
                  ? "app-text-primary bg-[rgb(var(--button-bg-hover))] shadow-sm"
                  : "app-text-muted hover:text-[rgb(var(--app-fg))]"
              }`}
            >
              {option === "zh" ? "中" : "EN"}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-testid="web-lite-clear-all-button"
          onClick={onClearAll}
          className="app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold"
        >
          <Trash2 className="h-4 w-4" />
          {copy.clearAll}
        </button>
      </div>
    </header>
  );
}
