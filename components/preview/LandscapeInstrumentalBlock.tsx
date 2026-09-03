"use client";

import { withAlpha } from "@/lib/palette-background";
import type { SongInfo } from "@/lib/types";

export function LandscapeInstrumentalBlock({
  song,
  instrumentalText,
  textColor,
  showAlbumName,
  left,
  top,
  width
}: {
  song: SongInfo;
  instrumentalText: string;
  textColor: string;
  showAlbumName: boolean;
  left: number;
  top: number;
  width: number;
}) {
  return (
    <section
      className="absolute z-10 text-left"
      style={{
        left,
        top,
        width,
        color: textColor
      }}
    >
      <h2 className="text-[64px] font-black leading-[1.1] tracking-normal">{song.title || "Untitled"}</h2>
      <p className="mt-6 text-[34px] font-semibold leading-[1.2]" style={{ color: withAlpha(textColor, 0.72) }}>
        {song.artist || "Unknown artist"}
      </p>
      {showAlbumName && song.album ? (
        <p className="mt-4 text-[24px] font-medium leading-[1.2]" style={{ color: withAlpha(textColor, 0.52) }}>
          {song.album}
        </p>
      ) : null}
      <p className="mt-12 text-[24px] font-semibold leading-[1.25]" style={{ color: withAlpha(textColor, 0.64) }}>
        {instrumentalText.trim() || "Instrumental Track"}
      </p>
    </section>
  );
}
