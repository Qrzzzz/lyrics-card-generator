"use client";

import { toPng } from "html-to-image";
import { useEffect, useRef, useState } from "react";
import { LyricCard, getCardSize } from "@/components/preview/LyricCard";
import { defaultState } from "@/components/editor/editor-defaults";
import { extractPaletteFromImage } from "@/lib/palette-extraction";
import { resolveAutoTextColor } from "@/lib/palette-background";
import type { CardStyle, ExtractedPalette, SongInfo, SongSource } from "@/lib/types";

type PreviewInput = {
  id: string;
  title: string;
  artist: string;
  source: SongSource;
  lyrics: string;
  coverDataUrl: string;
};

type PreviewResult = {
  id: string;
  dataUrl: string;
  colors: string[];
};

declare global {
  interface Window {
    renderExamplePreviews?: (items: PreviewInput[]) => Promise<PreviewResult[]>;
  }
}

export function ExamplePreviewGeneratorClient() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ song: SongInfo; lyrics: string; style: CardStyle } | null>(null);

  useEffect(() => {
    window.renderExamplePreviews = async (items) => {
      const results: PreviewResult[] = [];

      for (const item of items) {
        const palette = await extractPaletteFromImage(item.coverDataUrl);
        const song: SongInfo = {
          source: item.source,
          title: item.title,
          artist: item.artist,
          album: "",
          originalCoverUrl: "",
          coverUrl: "",
          proxiedCoverUrl: ""
        };
        const style = buildPreviewStyle(palette);

        setActive({ song, lyrics: item.lyrics, style });
        await nextFrame();
        await nextFrame();

        const node = hostRef.current?.querySelector("[data-export-card='true']") as HTMLElement | null;
        if (!node) {
          throw new Error(`Unable to render example preview for ${item.id}.`);
        }

        if ("fonts" in document) {
          await document.fonts.ready;
        }

        const size = getCardSize(style);
        const dataUrl = await toPng(node, {
          cacheBust: true,
          pixelRatio: 0.42,
          width: size.width,
          height: size.height,
          style: {
            width: `${size.width}px`,
            height: `${size.height}px`,
            transform: "none"
          }
        });

        results.push({
          id: item.id,
          dataUrl,
          colors: palette.colors.slice(0, 3)
        });
      }

      setActive(null);
      return results;
    };

    return () => {
      delete window.renderExamplePreviews;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#05060A] p-6 text-white">
      <p className="text-sm text-white/70">Example preview generator</p>
      <div ref={hostRef} className="fixed left-[-2000px] top-0 opacity-100">
        {active ? <LyricCard song={active.song} lyrics={active.lyrics} style={active.style} locale="en" /> : null}
      </div>
    </main>
  );
}

function buildPreviewStyle(palette: ExtractedPalette): CardStyle {
  return {
    ...defaultState.style,
    backgroundMode: "palette",
    extractedPalette: palette,
    layoutMode: "portrait",
    ratio: "4:5",
    width: 1080,
    height: 1350,
    autoHeight: false,
    font: "sans-heavy",
    lyricFontSize: 58,
    lineHeight: 1.34,
    align: "left",
    textColorMode: "auto",
    resolvedTextColor: resolveAutoTextColor(),
    translationEnabled: false,
    translationText: "",
    translationScale: 0.75,
    allowTwoLineTitle: false,
    contentMode: "lyrics",
    showCover: false,
    showSongInfo: true,
    showAlbumName: false,
    showPlatformBadge: false,
    showGeneratedWatermark: false,
    showSharedBy: false,
    showWatermark: false,
    showFineGrid: false,
    fineGridDensity: "medium"
  };
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
