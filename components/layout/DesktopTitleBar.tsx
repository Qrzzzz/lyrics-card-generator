"use client";

import { useEffect, useRef, useState } from "react";
import { APP_VERSION } from "@/lib/app-version";
import { getLyricsCardDesktopApi, type LyricsCardDesktopApi } from "@/lib/desktop-api";
import { createT } from "@/lib/i18n";
import { shutdownCoordinator } from "@/lib/persistence/shutdown-coordinator";
import { APP_ICON_URL } from "@/lib/static-assets";
import { systemDialogCopy } from "@/lib/system-dialog-copy";
import { showSystemAlert } from "@/lib/system-dialog";
import type { Locale } from "@/lib/types";
import type { AutosaveStatus } from "@/lib/editor-draft";
import { editorAutosaveCopy } from "@/lib/editor-autosave-copy";
import { TitlebarGradualBlur } from "@/components/layout/TitlebarGradualBlur";

type DesktopTitleBarProps = {
  locale: Locale;
  autosaveStatus?: AutosaveStatus;
  onRetryAutosave?: () => void;
};

export function DesktopTitleBar({ locale, autosaveStatus, onRetryAutosave }: DesktopTitleBarProps) {
  const [desktop, setDesktop] = useState<LyricsCardDesktopApi>();
  const [maximized, setMaximized] = useState(false);
  const titlebarRef = useRef<HTMLElement | null>(null);
  const brandRef = useRef<HTMLDivElement | null>(null);
  const t = createT(locale);

  useEffect(() => {
    setDesktop(getLyricsCardDesktopApi());
  }, []);

  useEffect(() => {
    const bar = titlebarRef.current;
    const brand = brandRef.current;
    if (!bar || !brand) return;
    const measure = () => {
      const clearance = brand.getBoundingClientRect().right - bar.getBoundingClientRect().left + 24;
      bar.style.setProperty("--autosave-side-clearance", `${Math.ceil(clearance)}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(brand);
    observer.observe(bar);
    measure();
    return () => observer.disconnect();
  }, [desktop, locale]);

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

  useEffect(() => {
    if (!desktop) return undefined;
    const handleCloseRequest = async () => {
      if (document.body.inert) return;
      document.body.inert = true;
      try {
        // Treat closing as a handshake: persist pending state before granting the native close.
        await shutdownCoordinator.flushAll();
        await desktop.confirmWindowClose();
      } catch {
        document.body.inert = false;
        // A failed flush deliberately leaves the window open rather than discarding unsaved state.
        const dialogCopy = systemDialogCopy[locale];
        await showSystemAlert({
          type: "error",
          title: dialogCopy.appTitle,
          message: dialogCopy.closeSaveFailedTitle,
          detail: editorAutosaveCopy[locale].closeFailed,
          closeLabel: dialogCopy.close
        });
      } finally {
        document.body.inert = false;
      }
    };
    return desktop.onWindowCloseRequested(() => void handleCloseRequest());
  }, [desktop, locale]);

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
    <header ref={titlebarRef} className="desktop-titlebar absolute inset-x-0 top-0 z-[90] flex h-12 items-center">
      <TitlebarGradualBlur />
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
      <div ref={brandRef} className="desktop-titlebar__brand flex min-w-0 items-center gap-2">
        <img
          src={APP_ICON_URL}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="desktop-titlebar__icon h-[18px] w-[18px] shrink-0 rounded-[5px]"
        />
        <span className="truncate text-sm font-bold" title={t("appTitle")}>{t("appTitle")}</span>
        <span className="shrink-0 text-[11px] font-semibold uppercase opacity-70">v{APP_VERSION}</span>
      </div>
      <div className="min-w-4 flex-1" />
      {autosaveStatus ? (
        <div className="desktop-titlebar__autosave" role="status" aria-live="polite" aria-atomic="true"
          data-testid="autosave-status" data-save-state={autosaveStatus}>
          {autosaveStatus === "error" ? (
            <button type="button" onClick={onRetryAutosave} title={editorAutosaveCopy[locale].error}>
              {editorAutosaveCopy[locale].error}
            </button>
          ) : <span title={editorAutosaveCopy[locale][autosaveStatus]}>{editorAutosaveCopy[locale][autosaveStatus]}</span>}
        </div>
      ) : null}
    </header>
  );
}
