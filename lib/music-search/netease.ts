import { getHighResolutionCoverUrl } from "@/lib/cover-url";
import { REQUEST_HEADERS } from "@/lib/parsers/shared";
import type { ParsedSongData } from "@/lib/types";
import type { ResolvedSongSearchResult, SongSearchResult } from "@/lib/music-search/types";

const SEARCH_ENDPOINT = "https://music.163.com/api/search/get/web";
const DETAIL_ENDPOINT = "https://music.163.com/api/song/detail";
const LYRIC_ENDPOINT = "https://music.163.com/api/song/lyric";
const SEARCH_CANDIDATE_LIMIT = 100;
const STRONG_MATCH_RANK = 450;

const NETEASE_HEADERS = {
  ...REQUEST_HEADERS,
  referer: "https://music.163.com/"
};

type NeteaseRawArtist = { name?: unknown };
type NeteaseRawAlbum = { name?: unknown; picUrl?: unknown; blurPicUrl?: unknown };
type NeteaseRawSong = {
  id?: unknown;
  name?: unknown;
  artists?: unknown;
  ar?: unknown;
  album?: unknown;
  al?: unknown;
  duration?: unknown;
  dt?: unknown;
};

export function buildNeteaseSongUrl(id: string) {
  return `https://music.163.com/song?id=${encodeURIComponent(id)}`;
}

export async function searchNeteaseSongs(keyword: string, limit = 8): Promise<SongSearchResult[]> {
  const form = new URLSearchParams();
  form.set("s", keyword);
  form.set("limit", String(SEARCH_CANDIDATE_LIMIT));
  form.set("type", "1");
  form.set("offset", "0");

  const response = await fetch(SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      ...NETEASE_HEADERS,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      cookie: "appver=2.0.2"
    },
    body: form,
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(`NetEase search returned HTTP ${response.status}.`);
  }

  return normalizeNeteaseSearchSongs(await response.json(), limit, keyword);
}

export async function resolveNeteaseSong(id: string): Promise<ResolvedSongSearchResult> {
  const song = await fetchNeteaseSongDetail(id);
  let lyrics = "";

  try {
    lyrics = await fetchNeteaseLyrics(id);
  } catch {
    lyrics = "";
  }

  return {
    song,
    lyrics,
    lyricSource: lyrics ? "netease" : "none",
    lyricNotice: lyrics ? "Imported NetEase lyrics." : "NetEase lyrics were not available."
  };
}

export function normalizeNeteaseSearchSongs(
  input: unknown,
  limit: number,
  keyword = ""
): SongSearchResult[] {
  const record = asRecord(input);
  const result = asRecord(record.result);
  const songs = Array.isArray(result.songs) ? result.songs : [];

  const normalized = songs
    .map((song) => toSearchResult(song))
    .filter((song): song is SongSearchResult => song !== null);

  return rankNeteaseSearchResults(normalized, keyword).slice(0, limit);
}

function rankNeteaseSearchResults(songs: SongSearchResult[], keyword: string) {
  const query = normalizeSemanticText(keyword);
  if (!query) {
    return songs;
  }

  const ranked = songs.map((song, index) => ({
    song,
    index,
    rank: getSemanticMatchRank(song, query)
  }));

  // Reorder only when at least one strong semantic match exists. Otherwise the
  // upstream relevance order is safer than weak substring evidence.
  if (!ranked.some((item) => item.rank >= STRONG_MATCH_RANK)) {
    return songs;
  }

  return ranked
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .map((item) => item.song);
}

function getSemanticMatchRank(song: SongSearchResult, query: string) {
  const title = normalizeSemanticText(song.title);
  const artists = song.artists.map(normalizeSemanticText).filter(Boolean);
  const titleMentioned = Boolean(title) && query.includes(title);
  const mentionedArtistCount = artists.filter((artist) => query.includes(artist)).length;

  if (artists.length > 0 && coversSemanticParts(query, [title, ...artists])) {
    return 700;
  }

  if (query === title || (artists.length > 0 && coversSemanticParts(query, artists))) {
    return 600;
  }

  if (artists.some((artist) => query === artist)) {
    return 550;
  }

  if (titleMentioned && mentionedArtistCount === artists.length && artists.length > 0) {
    return 500;
  }

  if (titleMentioned && mentionedArtistCount > 0) {
    return 450;
  }

  if (titleMentioned) {
    return 300;
  }

  return mentionedArtistCount > 0 ? 250 : 0;
}

function coversSemanticParts(query: string, parts: string[]) {
  // Consume longer parts first so a short artist/title substring cannot steal
  // characters that belong to a more specific semantic component.
  const normalizedParts = parts.filter(Boolean).sort((left, right) => right.length - left.length);
  if (normalizedParts.length !== parts.length || normalizedParts.length === 0) {
    return false;
  }

  let remainder = query;
  for (const part of normalizedParts) {
    const index = remainder.indexOf(part);
    if (index < 0) {
      return false;
    }
    remainder = remainder.slice(0, index) + remainder.slice(index + part.length);
  }

  return /^[\p{P}\p{S}]*$/u.test(remainder);
}

function normalizeSemanticText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

export function normalizeNeteaseDetail(input: unknown, id: string): ParsedSongData {
  const record = asRecord(input);
  const songs = Array.isArray(record.songs) ? record.songs : [];
  const rawSong = asNeteaseSong(songs[0]);

  if (!rawSong) {
    throw new Error("NetEase API did not return song metadata.");
  }

  const title = stringValue(rawSong.name);
  const artists = getArtists(rawSong);
  const album = asAlbum(rawSong.album) ?? asAlbum(rawSong.al);
  const albumName = stringValue(album?.name);
  const originalCoverUrl = stringValue(album?.picUrl) || stringValue(album?.blurPicUrl);
  const originalUrl = buildNeteaseSongUrl(id);

  if (!title) {
    throw new Error("NetEase API did not return a song title.");
  }

  return {
    source: "netease",
    title,
    artist: artists.join(" / "),
    album: albumName,
    coverUrl: originalCoverUrl ? getHighResolutionCoverUrl(originalCoverUrl, "netease") : "",
    originalCoverUrl,
    proxiedCoverUrl: "",
    originalUrl,
    finalUrl: originalUrl,
    parseMethod: "netease-search"
  };
}

export function normalizeNeteaseLyrics(input: unknown) {
  const record = asRecord(input);
  const lrc = asRecord(record.lrc);
  const raw = typeof lrc.lyric === "string" ? lrc.lyric : "";
  return stripLrcTimestamps(raw);
}

async function fetchNeteaseSongDetail(id: string): Promise<ParsedSongData> {
  const response = await fetch(`${DETAIL_ENDPOINT}?ids=[${encodeURIComponent(id)}]`, {
    headers: NETEASE_HEADERS,
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(`NetEase detail returned HTTP ${response.status}.`);
  }

  return normalizeNeteaseDetail(await response.json(), id);
}

async function fetchNeteaseLyrics(id: string) {
  const params = new URLSearchParams({
    id,
    lv: "1",
    kv: "1",
    tv: "-1"
  });

  const response = await fetch(`${LYRIC_ENDPOINT}?${params.toString()}`, {
    headers: NETEASE_HEADERS,
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(`NetEase lyric returned HTTP ${response.status}.`);
  }

  return normalizeNeteaseLyrics(await response.json());
}

function toSearchResult(input: unknown): SongSearchResult | null {
  const song = asNeteaseSong(input);
  if (!song) {
    return null;
  }

  const id = stringValue(song.id);
  const title = stringValue(song.name);
  if (!/^\d+$/.test(id) || !title) {
    return null;
  }

  const artists = getArtists(song);
  const album = asAlbum(song.album) ?? asAlbum(song.al);
  const coverUrl = stringValue(album?.picUrl) || stringValue(album?.blurPicUrl) || undefined;
  const durationMs = numberValue(song.duration ?? song.dt);

  return {
    source: "netease",
    id,
    title,
    artist: artists.join(" / "),
    artists,
    album: stringValue(album?.name) || undefined,
    durationMs,
    coverUrl,
    pageUrl: buildNeteaseSongUrl(id)
  };
}

function getArtists(song: NeteaseRawSong) {
  const rawArtists = Array.isArray(song.artists) ? song.artists : Array.isArray(song.ar) ? song.ar : [];
  return rawArtists
    .map((artist) => stringValue((artist as NeteaseRawArtist).name))
    .filter(Boolean);
}

function stripLrcTimestamps(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/(?:\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\])+/g, "").trimEnd())
    .filter((line) => !/^\[(ar|ti|al|by|offset):/i.test(line.trim()))
    .join("\n")
    .trim();
}

function asNeteaseSong(input: unknown): NeteaseRawSong | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  return input as NeteaseRawSong;
}

function asAlbum(input: unknown): NeteaseRawAlbum | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  return input as NeteaseRawAlbum;
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}
