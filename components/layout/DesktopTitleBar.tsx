"use client";

import { useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/app-version";
import { getLyricsCardDesktopApi, type LyricsCardDesktopApi } from "@/lib/desktop-api";
import { createT } from "@/lib/i18n";
import { shutdownCoordinator } from "@/lib/persistence/shutdown-coordinator";
import type { Locale } from "@/lib/types";
import { TitlebarGradualBlur } from "@/components/layout/TitlebarGradualBlur";

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

  useEffect(() => {
    if (!desktop) return undefined;
    const handleCloseRequest = async () => {
      try {
        // Treat closing as a handshake: persist pending state before granting the native close.
        await shutdownCoordinator.flushAll();
        await desktop.confirmWindowClose();
      } catch {
        // A failed flush deliberately leaves the window open rather than discarding unsaved state.
        window.alert(closeFailureMessages[locale]);
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
    <header className="desktop-titlebar absolute inset-x-0 top-0 z-[90] flex h-12 items-center">
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
      <div className="desktop-titlebar__brand flex min-w-0 items-center gap-2">
        <img
          src="/app-icon.png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="desktop-titlebar__icon h-[18px] w-[18px] shrink-0 rounded-[5px]"
        />
        <span className="truncate text-sm font-bold">{t("appTitle")}</span>
        <span className="shrink-0 text-[11px] font-semibold uppercase opacity-70">v{APP_VERSION}</span>
      </div>
      <div className="min-w-4 flex-1" />
    </header>
  );
}

const closeFailureMessages: Record<Locale, string> = {
  zh: "设置保存失败，应用尚未关闭。请检查磁盘状态后重试。",
  "zh-TW": "設定儲存失敗，應用程式尚未關閉。請檢查磁碟狀態後重試。",
  en: "Settings could not be saved, so the app remains open. Check the disk and try again.",
  fr: "Les paramètres n’ont pas pu être enregistrés. L’application reste ouverte. Vérifiez le disque et réessayez.",
  ja: "設定を保存できなかったため、アプリは開いたままです。ディスクを確認して再試行してください。",
  es: "No se pudo guardar la configuración, por lo que la aplicación sigue abierta. Comprueba el disco e inténtalo de nuevo."
};
