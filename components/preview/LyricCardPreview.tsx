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
  const [availableHeight, setAvailableHeight] = useState(320);
  const size = getCardSize(style);
  const widthScale = Math.max(width, 120) / size.width;
  const heightScale = Math.max(availableHeight, 120) / size.height;
  const scale = Math.min(widthScale, heightScale, 0.52);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rect = shell.getBoundingClientRect();
        const styles = window.getComputedStyle(shell);
        const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
        const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
        setWidth(Math.max(0, shell.clientWidth - horizontalPadding));
        setAvailableHeight(Math.max(0, window.innerHeight - rect.top - verticalPadding - 16));
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    measure();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
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
      <div
        ref={shellRef}
        data-testid="lyric-card-preview-shell"
        data-preview-scale={scale.toFixed(4)}
        className="flex min-w-0 items-center justify-center overflow-hidden rounded-lg bg-black/18 p-3"
      >
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
