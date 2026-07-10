"use client";

import { Download, Github, Trash2 } from "lucide-react";
import type { createT } from "@/lib/i18n";
import type { WebLiteCopy, WebLiteLocale } from "@/web-lite/copy";
import { WEB_LITE_DESKTOP_URL, WEB_LITE_REPOSITORY_URL } from "@/web-lite/links";

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
    <header className="glass-panel relative z-40 flex min-h-[var(--app-header-height)] min-w-0 max-w-full flex-col justify-center gap-4 rounded-lg px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
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

      <div className="grid w-full min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:items-center">
          <a
            data-testid="web-lite-desktop-link"
            href={WEB_LITE_DESKTOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="control-focus inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-[var(--app-accent)] bg-[var(--control-selected-bg-strong)] px-3 text-sm font-black text-[var(--app-accent)] transition hover:bg-[var(--control-selected-bg)]"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="truncate">{copy.headerDesktop}</span>
          </a>
          <a
            data-testid="web-lite-repository-link"
            href={WEB_LITE_REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="app-button control-focus inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold"
          >
            <Github className="h-4 w-4 shrink-0" />
            <span className="truncate">{copy.headerRepository}</span>
          </a>
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:ml-auto xl:ml-0">
          <div
            role="radiogroup"
            aria-label={copy.language}
            className="segmented-control grid h-10 shrink-0 grid-cols-2 rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] p-1"
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
            className="app-button inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold sm:flex-none"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{copy.clearAll}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
