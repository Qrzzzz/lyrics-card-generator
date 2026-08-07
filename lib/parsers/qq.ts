import {
  buildSongInfo,
  extractArtistFromDescription,
  extractMeta,
  fetchHtml,
  REQUEST_HEADERS,
  songInfoFromMeta,
  splitTitleAndArtist
} from "@/lib/parsers/shared";
import { safeFetch } from "@/lib/safe-fetch";

type QQEmbeddedSong = {
  songname?: string;
  songName?: string;
  title?: string;
  singer?: Array<{ name?: string }> | string;
  albumname?: string;
  albumName?: string;
  albummid?: string;
  albumMid?: string;
  songmid?: string;
};

type QQApiSong = {
  name?: string;
  title?: string;
  mid?: string;
  singer?: Array<{ name?: string }>;
  album?: {
    name?: string;
    title?: string;
    mid?: string;
    pmid?: string;
  };
};

type QQApiResponse = {
  code?: number;
  data?: QQApiSong[];
};

export async function parseQQMusic(finalUrl: string, originalUrl: string) {
  const songId = extractQQSongId(finalUrl) || extractQQSongId(originalUrl);
  if (songId) {
    try {
      return await parseQQApi(songId, finalUrl, originalUrl);
    } catch {
      // Continue to HTML/OG fallback below.
    }
  }

  const { html, finalUrl: fetchedFinalUrl } = await fetchHtml(finalUrl);
  const url = fetchedFinalUrl || finalUrl;
  const embedded = extractEmbeddedSong(html);
  const meta = extractMeta(html, url);

  if (embedded?.songname || embedded?.songName || embedded?.title || embedded?.albummid || embedded?.albumMid) {
    const parsed = splitTitleAndArtist(meta.rawTitle, "qq");
    const title = embedded.songname || embedded.songName || embedded.title || parsed.title;
    const artist = extractSinger(embedded.singer) || parsed.artist;
    const album = embedded.albumname || embedded.albumName || "";
    const albumMid = embedded.albummid || embedded.albumMid || "";
    const coverUrl = albumMid ? qqAlbumCover(albumMid) : meta.image;

    return buildSongInfo({
      source: "qq",
      title,
      artist,
      album,
      coverUrl,
      originalUrl,
      finalUrl: url,
      parseMethod: "qq-html-json"
    });
  }

  const parsed = splitTitleAndArtist(meta.rawTitle, "qq");
  const descriptionArtist = extractArtistFromDescription(meta.description);
  const coverUrl = highQualityQQCover(meta.image);

  if ((parsed.title && parsed.title !== "-") || coverUrl) {
    return buildSongInfo({
      source: "qq",
      title: parsed.title,
      artist: parsed.artist || descriptionArtist,
      coverUrl,
      originalUrl,
      finalUrl: url,
      parseMethod: "qq-og"
    });
  }

  return songInfoFromMeta({
    source: "qq",
    html,
    url,
    originalUrl,
    parseMethod: "qq-og"
  });
}

async function parseQQApi(
  songId: NonNullable<ReturnType<typeof extractQQSongId>>,
  finalUrl: string,
  originalUrl: string
) {
  const queryKey = songId.type === "songid" ? "songid" : "songmid";
  const apiUrl = `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?${queryKey}=${encodeURIComponent(
    songId.value
  )}&format=jsonp`;
  const res = await safeFetch(apiUrl, {
    headers: {
      ...REQUEST_HEADERS,
      accept: "application/json,text/plain,application/javascript,*/*;q=0.8",
      referer: "https://y.qq.com/"
    },
    timeoutMs: 10000,
    maxRedirects: 5,
    maxResponseBytes: 2 * 1024 * 1024,
    allowedContentTypes: ["application/json", "text/plain", "application/javascript"]
  });

  if (!res.ok) {
    throw new Error(`QQ Music API returned HTTP ${res.status}.`);
  }

  const data = parseQQJsonp(res.text());
  const song = data.data?.[0];
  if (!song?.name && !song?.title) {
    throw new Error("QQ Music API did not return song metadata.");
  }

  const albumMid = song.album?.pmid || song.album?.mid || "";

  return buildSongInfo({
    source: "qq",
    title: song.name || song.title || "",
    artist: song.singer?.map((singer) => singer.name).filter(Boolean).join(" / ") || "",
    album: song.album?.name || song.album?.title || "",
    coverUrl: albumMid ? qqAlbumCover(albumMid.replace(/_\d+$/, "")) : "",
    originalUrl,
    finalUrl,
    parseMethod: "qq-html-json"
  });
}

function parseQQJsonp(text: string): QQApiResponse {
  const trimmed = text.trim().replace(/;$/, "");
  const json = trimmed.startsWith("(") && trimmed.endsWith(")") ? trimmed.slice(1, -1) : trimmed;
  return JSON.parse(json) as QQApiResponse;
}

export function extractQQSongId(inputUrl: string) {
  try {
    const url = new URL(inputUrl);
    const songId = url.searchParams.get("songid") || url.hash.match(/[?&]songid=([^&#]+)/i)?.[1];
    if (songId) {
      return { type: "songid", value: songId };
    }

    const songMid = url.searchParams.get("songmid") || url.hash.match(/[?&]songmid=([^&#]+)/i)?.[1];
    if (songMid) {
      return { type: "songmid", value: songMid };
    }

    const pathValue = url.pathname.match(/\/songDetail\/([^/?#]+)/i)?.[1];
    if (pathValue) {
      return { type: /^\d+$/.test(pathValue) ? "songid" : "songmid", value: pathValue };
    }
  } catch {
    // Fall through to regex parsing.
  }

  const regexSongId = inputUrl.match(/[?&]songid=([^&#]+)/i)?.[1];
  if (regexSongId) {
    return { type: "songid", value: regexSongId };
  }

  const regexSongMid = inputUrl.match(/[?&]songmid=([^&#]+)/i)?.[1];
  if (regexSongMid) {
    return { type: "songmid", value: regexSongMid };
  }

  const pathValue = inputUrl.match(/\/songDetail\/([^/?#]+)/i)?.[1];
  return pathValue
    ? { type: /^\d+$/.test(pathValue) ? "songid" : "songmid", value: pathValue }
    : null;
}

export function extractQQSongMid(inputUrl: string) {
  try {
    const url = new URL(inputUrl);
    const fromPath = url.pathname.match(/\/songDetail\/([^/?#]+)/i)?.[1];
    const fromSearch = url.searchParams.get("songmid");
    const fromHash = url.hash.match(/[?&]songmid=([^&#]+)/i)?.[1];
    return fromPath || fromSearch || fromHash || "";
  } catch {
    return inputUrl.match(/\/songDetail\/([^/?#]+)/i)?.[1] || inputUrl.match(/[?&]songmid=([^&#]+)/i)?.[1] || "";
  }
}

function extractEmbeddedSong(html: string): QQEmbeddedSong | null {
  const nextData = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  const fromNext = nextData ? findSongObject(safeJson(nextData)) : null;
  if (fromNext) {
    return fromNext;
  }

  const loose: QQEmbeddedSong = {};
  loose.songname = matchJsonString(html, "songname") || matchJsonString(html, "songName");
  loose.albumname = matchJsonString(html, "albumname") || matchJsonString(html, "albumName");
  loose.albummid = matchJsonString(html, "albummid") || matchJsonString(html, "albumMid");
  loose.songmid = matchJsonString(html, "songmid");

  const singerName = matchJsonString(html, "singername") || matchJsonString(html, "singerName");
  if (singerName) {
    loose.singer = singerName;
  }

  return loose.songname || loose.albumname || loose.albummid || loose.songmid ? loose : null;
}

function findSongObject(value: unknown): QQEmbeddedSong | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.songname === "string" ||
    typeof record.songName === "string" ||
    typeof record.albummid === "string" ||
    typeof record.albumMid === "string"
  ) {
    return record as QQEmbeddedSong;
  }

  // QQ has moved the song payload between nested hydration objects over time;
  // traverse the unknown tree and stop at the first record with song markers.
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findSongObject(item);
        if (found) {
          return found;
        }
      }
    } else {
      const found = findSongObject(child);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function matchJsonString(html: string, key: string) {
  return html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i"))?.[1]?.replace(/\\u([\dA-Fa-f]{4})/g, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 16))
  );
}

function extractSinger(singer: QQEmbeddedSong["singer"]) {
  if (typeof singer === "string") {
    return singer;
  }

  return singer?.map((item) => item.name).filter(Boolean).join(" / ") || "";
}

function qqAlbumCover(albumMid: string) {
  return `https://y.qq.com/music/photo_new/T002R1000x1000M000${albumMid}.jpg`;
}

function highQualityQQCover(url: string) {
  return url
    .replace(/T002R\d+x\d+M000/i, "T002R1000x1000M000")
    .replace(/R\d+x\d+/i, "R1000x1000");
}
