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
        textShadow: measurement || isColorDark(textColor) ? "none" : "0 10px 32px rgba(0,0,0,0.34)"
      }}
    >
      <h1
        className="break-words font-black tracking-normal"
        style={{ fontSize: 52 * scale, lineHeight: 1.18, overflowWrap: "anywhere" }}
      >
        <span>{song.title || "Untitled"}</span>{" "}
        <ExplicitBadge show={song.explicit} textColor={textColor} />
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

function isColorDark(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return false;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 < 0.42;
}
