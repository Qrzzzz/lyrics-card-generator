"use client";

import { ExplicitBadge } from "@/components/preview/ExplicitBadge";
import { withAlpha } from "@/lib/palette-background";
import type { SongInfo } from "@/lib/types";

export function LandscapeSongMetadata({
  song,
  textColor,
  showAlbumName,
  scale = 1,
  measurement = false
}: {
  song: SongInfo;
  textColor: string;
  showAlbumName: boolean;
  scale?: number;
  measurement?: boolean;
}) {
  return (
    <header
      data-landscape-song-metadata
      style={{
        color: textColor,
        textShadow: measurement ? "none" : undefined
      }}
    >
      <h1
        className="break-words font-black tracking-normal"
        style={{ fontSize: 52 * scale, lineHeight: 1.18, overflowWrap: "anywhere" }}
      >
        <span>{song.title || "Untitled"}</span>{" "}
        <ExplicitBadge show={song.explicit} />
      </h1>
      <p
        className="break-words font-semibold"
        style={{ marginTop: 16 * scale, color: withAlpha(textColor, 0.72), fontSize: 30 * scale, lineHeight: 1.32 }}
      >
        {song.artist || "Unknown artist"}
      </p>
      {showAlbumName && song.album?.trim() ? (
        <p
          className="break-words font-medium"
          style={{ marginTop: 10 * scale, color: withAlpha(textColor, 0.52), fontSize: 23 * scale, lineHeight: 1.35 }}
        >
          {song.album}
        </p>
      ) : null}
    </header>
  );
}
