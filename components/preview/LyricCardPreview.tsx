"use client";

import { useEffect, useRef, useState } from "react";
import { LyricCard, getCardSize } from "@/components/preview/LyricCard";
import type { createT } from "@/lib/i18n";
import type { CardStyle, Locale, SongInfo } from "@/lib/types";

export function LyricCardPreview({
  song,
  lyrics,
  style,
  cardRef,
  t,
  sticky = true,
  locale = "en"
}: {
  song: SongInfo;
  lyrics: string;
  style: CardStyle;
  cardRef: React.RefObject<HTMLElement | null>;
  t: ReturnType<typeof createT>;
  sticky?: boolean;
  locale?: Locale;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const size = getCardSize(style);
  const scale = Math.min(Math.max(width, 280) / size.width, 0.52);

  useEffect(() => {
    if (!shellRef.current) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(shellRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <section data-testid="lyric-card-preview" className={`glass-panel min-w-0 self-start rounded-lg p-4 ${sticky ? "sticky top-6" : ""}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="app-text-subtle text-[11px] uppercase tracking-[0.16em]">{t("livePreview")}</p>
          <h2 className="app-text-primary text-base font-semibold">{t("exportCardOnly")}</h2>
        </div>
        <span className="app-text-subtle rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] px-2.5 py-1 text-xs">
          {size.width}x{size.height}
        </span>
      </div>
      <div ref={shellRef} data-testid="lyric-card-preview-shell" className="flex min-w-0 items-center justify-center overflow-hidden rounded-lg bg-black/18 p-3">
        <div
          style={{
            width: size.width * scale,
            height: size.height * scale,
            maxWidth: "100%"
          }}
        >
          <div
            ref={cardRef as React.RefObject<HTMLDivElement>}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left"
            }}
          >
            <LyricCard song={song} lyrics={lyrics} style={style} locale={locale} />
          </div>
        </div>
      </div>
    </section>
  );
}
