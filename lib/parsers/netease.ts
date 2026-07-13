import {
  buildSongInfo,
  extractMeta,
  fetchHtml,
  fetchJson,
  songInfoFromMeta,
  splitTitleAndArtist
} from "@/lib/parsers/shared";

type NeteaseApiSong = {
  name?: string;
  artists?: Array<{ name?: string }>;
  ar?: Array<{ name?: string }>;
  album?: {
    name?: string;
    picUrl?: string;
    blurPicUrl?: string;
  };
  al?: {
    name?: string;
    picUrl?: string;
  };
};

type NeteaseApiResponse = {
  songs?: NeteaseApiSong[];
};

export async function parseNetease(finalUrl: string, originalUrl: string) {
  const songId = extractNeteaseSongId(finalUrl) || extractNeteaseSongId(originalUrl);

  if (songId) {
    try {
      return await parseNeteaseApi(songId, finalUrl, originalUrl);
    } catch {
      // Continue to OG fallback below.
    }
  }

  return parseNeteaseOg(finalUrl, originalUrl);
}

export function extractNeteaseSongId(inputUrl: string) {
  const normalized = inputUrl.replace(/\/#\/song\?/i, "/song?");

  try {
    const url = new URL(normalized);
    const directId = url.searchParams.get("id");
    if (directId && /^\d+$/.test(directId)) {
      return directId;
    }

    if (url.hash) {
      const hashId = url.hash.match(/[?&]id=(\d+)/);
      if (hashId?.[1]) {
        return hashId[1];
      }
    }
  } catch {
    // Fall through to regex parsing.
  }

  return normalized.match(/[?&]id=(\d+)/)?.[1] || "";
}

async function parseNeteaseApi(songId: string, finalUrl: string, originalUrl: string) {
  const data = await fetchJson<NeteaseApiResponse>(
    `https://music.163.com/api/song/detail?ids=[${encodeURIComponent(songId)}]`,
    {
      headers: {
        referer: "https://music.163.com/"
      }
    }
  );
  const song = data.songs?.[0];

  if (!song?.name) {
    throw new Error("NetEase API did not return song metadata.");
  }

  const artists = song.artists || song.ar || [];
  const album = song.album || song.al;
  const coverUrl = album?.picUrl || song.album?.blurPicUrl || "";

  return buildSongInfo({
    source: "netease",
    title: song.name,
    artist: artists.map((artist) => artist.name).filter(Boolean).join(" / "),
    album: album?.name || "",
    coverUrl,
    originalUrl,
    finalUrl,
    parseMethod: "netease-api"
  });
}

async function parseNeteaseOg(finalUrl: string, originalUrl: string) {
  const { html, finalUrl: fetchedFinalUrl } = await fetchHtml(finalUrl);
  const url = fetchedFinalUrl || finalUrl;

  try {
    const meta = extractMeta(html, url);
    const parsed = splitTitleAndArtist(meta.rawTitle, "netease");

    return buildSongInfo({
      source: "netease",
      title: parsed.title,
      artist: parsed.artist,
      coverUrl: meta.image,
      originalUrl,
      finalUrl: url,
      parseMethod: "netease-og"
    });
  } catch {
    return songInfoFromMeta({
      source: "netease",
      html,
      url,
      originalUrl,
      parseMethod: "netease-og"
    });
  }
}
