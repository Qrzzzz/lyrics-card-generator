"use client";

import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/app-version";
import { getLyricsCardDesktopApi, type LyricsCardDesktopApi } from "@/lib/desktop-api";

export function DesktopTitleBar() {
  const [desktop, setDesktop] = useState<LyricsCardDesktopApi>();

  useEffect(() => {
    setDesktop(getLyricsCardDesktopApi());
  }, []);

  if (!desktop) {
    return null;
  }

  return (
    <header className="desktop-titlebar fixed inset-x-0 top-0 z-[160] flex h-12 items-center justify-between">
      <div className="desktop-titlebar__brand flex min-w-0 items-center gap-3 px-4">
        <img
          src="/app-icon.png"
          alt=""
          aria-hidden="true"
          className="h-6 w-6 shrink-0 rounded-md shadow-sm"
        />
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-bold">Lyrics Card Generator</span>
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-normal opacity-70">v{APP_VERSION}</span>
        </div>
      </div>
      <div className="desktop-titlebar__controls flex h-full items-stretch">
        <button
          type="button"
          className="desktop-titlebar__button"
          aria-label="Minimize"
          title="Minimize"
          onClick={() => void desktop.minimizeWindow()}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="desktop-titlebar__button"
          aria-label="Maximize or restore"
          title="Maximize or restore"
          onClick={() => void desktop.toggleMaximizeWindow()}
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="desktop-titlebar__button desktop-titlebar__button--close"
          aria-label="Close"
          title="Close"
          onClick={() => void desktop.closeWindow()}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
