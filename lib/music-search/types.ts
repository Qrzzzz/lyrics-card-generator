import type { ParsedSongData } from "@/lib/types";

export type MusicSearchSource = "netease";

export type SongSearchResult = {
  source: MusicSearchSource;
  id: string;
  title: string;
  artist: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  coverUrl?: string;
  pageUrl: string;
};

export type ResolvedSongSearchResult = {
  song: ParsedSongData;
  lyrics?: string;
  lyricSource?: "netease" | "none";
  lyricNotice?: string;
};

export type SearchSongResponse =
  | { ok: true; data: SongSearchResult[] }
  | { ok: false; error: string };

export type ResolveSearchedSongResponse =
  | { ok: true; data: ResolvedSongSearchResult }
  | { ok: false; error: string };
