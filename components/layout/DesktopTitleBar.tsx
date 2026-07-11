"use client";

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

  useEffect(() => {
    if (!desktop) {
      return undefined;
    }

    document.body.dataset.windowMaximized = maximized ? "true" : "false";
    return () => {
      delete document.body.dataset.windowMaximized;
    };
  }, [desktop, maximized]);

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
    <header className="desktop-titlebar absolute inset-x-0 top-0 z-[90] flex h-12 items-center">
      <div className="desktop-titlebar__traffic-lights flex shrink-0 items-center gap-0 px-4">
        <button
          type="button"
          className="traffic-light traffic-light--close"
          aria-label={t("titleBar.close")}
          title={t("titleBar.close")}
          onClick={() => void desktop.closeWindow()}
        />
        <button
          type="button"
          className="traffic-light traffic-light--minimize"
          aria-label={t("titleBar.minimize")}
          title={t("titleBar.minimize")}
          onClick={() => void desktop.minimizeWindow()}
        />
        <button
          type="button"
          className="traffic-light traffic-light--maximize"
          aria-label={maximizeLabel}
          title={maximizeLabel}
          onClick={() => void toggleMaximize()}
        />
      </div>
      <div className="desktop-titlebar__brand flex min-w-0 items-baseline gap-2">
        <span className="truncate text-sm font-bold">{t("appTitle")}</span>
        <span className="shrink-0 text-[11px] font-semibold uppercase opacity-70">v{APP_VERSION}</span>
      </div>
      <div className="min-w-4 flex-1" />
    </header>
  );
}
