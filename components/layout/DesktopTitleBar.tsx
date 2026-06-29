"use client";

import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/app-version";
import { getLyricsCardDesktopApi, type LyricsCardDesktopApi } from "@/lib/desktop-api";
import { createT } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

type DesktopTitleBarProps = {
  locale: Locale;
};

export function DesktopTitleBar({ locale }: DesktopTitleBarProps) {
  const [desktop, setDesktop] = useState<LyricsCardDesktopApi>();
  const [maximized, setMaximized] = useState(false);
  const t = createT(locale);

  useEffect(() => {
    setDesktop(getLyricsCardDesktopApi());
  }, []);

  useEffect(() => {
    if (!desktop) {
      return undefined;
    }

    let disposed = false;

    void desktop.getWindowState()
      .then((state) => {
        if (!disposed) {
          setMaximized(state.maximized);
        }
      })
      .catch(() => undefined);

    const unsubscribe = desktop.onWindowStateChanged((state) => {
      setMaximized(state.maximized);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [desktop]);

  if (!desktop) {
    return null;
  }

  const maximizeLabel = maximized ? t("titleBar.restore") : t("titleBar.maximize");

  async function toggleMaximize() {
    const state = await desktop?.toggleMaximizeWindow();
    if (state) {
      setMaximized(state.maximized);
    }
  }

  return (
    <header className="desktop-titlebar fixed inset-x-0 top-0 z-[90] flex h-12 items-center justify-between">
      <div className="desktop-titlebar__brand flex min-w-0 items-center gap-3 px-4">
        <img
          src="/app-icon.png"
          alt=""
          aria-hidden="true"
          className="h-6 w-6 shrink-0 rounded-md shadow-sm"
        />
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-bold">{t("appTitle")}</span>
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-normal opacity-70">v{APP_VERSION}</span>
        </div>
      </div>
      <div className="desktop-titlebar__controls flex h-full items-stretch">
        <button
          type="button"
          className="desktop-titlebar__button"
          aria-label={t("titleBar.minimize")}
          title={t("titleBar.minimize")}
          onClick={() => void desktop.minimizeWindow()}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="desktop-titlebar__button"
          aria-label={maximizeLabel}
          title={maximizeLabel}
          onClick={() => void toggleMaximize()}
        >
          {maximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          className="desktop-titlebar__button desktop-titlebar__button--close"
          aria-label={t("titleBar.close")}
          title={t("titleBar.close")}
          onClick={() => void desktop.closeWindow()}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
