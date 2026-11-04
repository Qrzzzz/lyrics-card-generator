"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { InstrumentalCoverBackground } from "@/components/preview/InstrumentalCoverBackground";
import { CardFooter } from "@/components/preview/CardFooter";
import { getArtworkAspectRatio } from "@/lib/artwork-geometry";
import { resolveCardCoverTextShadow } from "@/lib/card-content-depth";
import { getInstrumentalDesign } from "@/lib/instrumental-layout";
import type { CardAlign, CoverArtworkAnalysis, SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function InstrumentalBlock({ song, coverUrl, coverArtwork, onCoverError, textColor, align,
  showAlbumName, allowMultiLineTitle, availableWidth, availableHeight,
  showGeneratedWatermark, showSharedBy, sharedByText
}: {
  song: SongInfo; coverUrl?: string; coverArtwork?: CoverArtworkAnalysis; onCoverError: () => void;
  textColor: string; align: CardAlign; showAlbumName: boolean; allowMultiLineTitle: boolean;
  availableWidth: number; availableHeight: number;
  showGeneratedWatermark: boolean; showSharedBy: boolean; sharedByText: string;
}) {
  const songInfoRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const design = getInstrumentalDesign(availableWidth, availableHeight);
  const aspect = getArtworkAspectRatio(coverUrl, coverArtwork);
  const artworkHeight = Math.min(availableWidth, availableWidth / aspect);
  const infoTop = Math.min(design.infoTop, artworkHeight * 0.75);
  const titleWidth = availableWidth - design.inset * 2;
  const hasCredits = showGeneratedWatermark || Boolean(showSharedBy && sharedByText.trim());
  const [infoBudget, setInfoBudget] = useState(design.infoBottom - infoTop);

  useLayoutEffect(() => {
    const node = songInfoRef.current; if (!node) return;
    const measure = () => {
      const footerTop = availableHeight - design.footerBottom - (footerRef.current?.offsetHeight ?? 0);
      const budget = Math.max(1, Math.min(design.infoBottom, footerTop - 32) - infoTop);
      let fittedSize = design.titleSize;
      node.style.setProperty("--instrumental-title-size", `${fittedSize}px`);
      while (allowMultiLineTitle && node.scrollHeight > budget + 1 && fittedSize > 40) {
        fittedSize = Math.max(40, fittedSize - 2);
        node.style.setProperty("--instrumental-title-size", `${fittedSize}px`);
      }
      setInfoBudget(budget);
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    if (footerRef.current) observer.observe(footerRef.current);
    return () => observer.disconnect();
  }, [song.title, song.artist, song.album, showAlbumName, allowMultiLineTitle, availableHeight,
    availableWidth, showGeneratedWatermark, showSharedBy, sharedByText, infoTop,
    design.titleSize, design.infoBottom, design.footerBottom]);

  return <div className="relative h-full w-full" data-instrumental-artwork-layout="edge-to-edge"
    style={{ color: textColor, textAlign: align }}>
    <InstrumentalCoverBackground sourceUrl={coverUrl} width={availableWidth} height={availableHeight} onError={onCoverError} />
    <div ref={songInfoRef} data-instrumental-song-info className="absolute min-w-0"
      style={{ left: design.inset, top: infoTop, width: titleWidth, maxHeight: infoBudget,
        textShadow: resolveCardCoverTextShadow(textColor) }}>
      <h2 className={cn("w-full font-black leading-[1.12] tracking-normal",
        allowMultiLineTitle ? "multi-line-title" : "truncate")}
        data-allow-multi-line-title={allowMultiLineTitle ? "true" : "false"}
        style={{ fontSize: `var(--instrumental-title-size, ${design.titleSize}px)` }}>
        {song.title || "Untitled"}
      </h2>
      <p className="mt-6 w-full truncate font-semibold leading-[1.3] opacity-[0.88]"
        style={{ fontSize: design.artistSize }}>{song.artist || "Unknown artist"}</p>
      {showAlbumName && song.album?.trim() ? <p data-instrumental-album
        className="mt-4 w-full truncate font-medium leading-[1.3] opacity-[0.73]"
        style={{ fontSize: design.albumSize }}>{song.album.trim()}</p> : null}
    </div>
    {hasCredits ? <div ref={footerRef} data-card-footer className="absolute min-w-0"
      style={{ left: design.inset, bottom: design.footerBottom, width: titleWidth,
        maxHeight: Math.max(1, availableHeight - design.infoBottom - 32) }}>
      <CardFooter showGeneratedWatermark={showGeneratedWatermark} showSharedBy={showSharedBy}
        sharedByText={sharedByText} textColor={textColor} instrumentalAlign={align} />
    </div> : null}
  </div>;
}
