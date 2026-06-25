import * as cheerio from "cheerio";
import {
  buildSongInfo,
  extractMeta,
  fetchJson,
  splitTitleAndArtist
} from "@/lib/parsers/shared";

type SpotifyOEmbedResponse = {
  title?: string;
  thumbnail_url?: string | null;
};

export async function parseSpotify(finalUrl: string, originalUrl: string) {
  const metadataUrl = toSpotifyTrackUrl(finalUrl) || finalUrl;

  try {
    return await parseSpotifyOEmbed(metadataUrl, originalUrl);
  } catch {
    // Continue to Open Graph fallback below.
  }

  return parseSpotifyOpenGraph(metadataUrl, originalUrl);
}

async function parseSpotifyOEmbed(finalUrl: string, originalUrl: string) {
  const endpoint = new URL("https://open.spotify.com/oembed");
  endpoint.searchParams.set("url", finalUrl);

  const data = await fetchJson<SpotifyOEmbedResponse>(endpoint.toString());
  const rawTitle = data.title?.trim() || "";
  const coverUrl = data.thumbnail_url?.trim() || "";

  if (!rawTitle && !coverUrl) {
    throw new Error("Spotify oEmbed did not return usable metadata.");
  }

  const parsed = splitSpotifyOEmbedTitle(rawTitle);
  const artist = parsed.artist || (await fetchSpotifyMetaArtist(finalUrl, parsed.title));

  return buildSongInfo({
    source: "spotify",
    title: parsed.title,
    artist,
    coverUrl,
    originalUrl,
    finalUrl,
    parseMethod: "spotify-oembed"
  });
}

async function parseSpotifyOpenGraph(finalUrl: string, originalUrl: string) {
  const { html, finalUrl: fetchedFinalUrl } = await fetchSpotifyHtml(finalUrl);
  const meta = extractMeta(html, fetchedFinalUrl || finalUrl);
  const parsed = splitTitleAndArtist(meta.rawTitle, "spotify");
  const artist = parsed.artist || extractSpotifyArtistFromHtml(html, parsed.title) || extractSpotifyArtistFromDescription(meta.description);

  if (!parsed.title && !meta.image) {
    throw new Error("No usable song metadata was found.");
  }

  return buildSongInfo({
    source: "spotify",
    title: parsed.title,
    artist,
    coverUrl: meta.image,
    originalUrl,
    finalUrl: fetchedFinalUrl || finalUrl,
    parseMethod: "spotify-og"
  });
}

async function fetchSpotifyMetaArtist(finalUrl: string, title: string) {
  try {
    const { html, finalUrl: fetchedFinalUrl } = await fetchSpotifyHtml(finalUrl);
    const meta = extractMeta(html, fetchedFinalUrl || finalUrl);
    return extractSpotifyArtistFromHtml(html, title) || extractSpotifyArtistFromDescription(meta.description);
  } catch {
    return "";
  }
}

async function fetchSpotifyHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "text/html,*/*;q=0.8"
    },
    signal: AbortSignal.timeout(10000),
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`The song page returned HTTP ${response.status}.`);
  }

  return {
    html: await response.text(),
    finalUrl: response.url || url
  };
}

function extractSpotifyArtistFromHtml(html: string, title: string) {
  const $ = cheerio.load(html);
  const musicianDescription = cleanSpotifyArtist($('meta[name="music:musician_description"]').attr("content") || "");
  if (musicianDescription) {
    return musicianDescription;
  }

  const description = $('meta[name="description"]').attr("content") || "";
  const songDescriptionMatch = description.match(/\bSong\s+·\s+(.+?)\s+·\s+\d{4}\b/i);
  if (songDescriptionMatch?.[1]) {
    return cleanSpotifyArtist(songDescriptionMatch[1]);
  }

  const titlePrefix = title ? escapeRegExp(title) : "";
  if (titlePrefix) {
    const listenMatch = description.match(new RegExp(`^Listen to ${titlePrefix} on Spotify\\.\\s+Song\\s+·\\s+(.+?)\\s+·`, "i"));
    if (listenMatch?.[1]) {
      return cleanSpotifyArtist(listenMatch[1]);
    }
  }

  return "";
}

function extractSpotifyArtistFromDescription(description: string) {
  const parts = description
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3 && normalizeForCompare(parts[2]) === "song") {
    return cleanSpotifyArtist(parts[0]);
  }

  return "";
}

export function extractSpotifyTrackId(inputUrl: string) {
  try {
    const url = new URL(inputUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const trackIndex = parts.findIndex((part) => part.toLowerCase() === "track");
    const id = trackIndex >= 0 ? parts[trackIndex + 1] : "";

    return isSpotifyTrackId(id) ? id : "";
  } catch {
    const id = inputUrl.match(/\/track\/([A-Za-z0-9]{22})(?:[/?#]|$)/)?.[1] || "";
    return isSpotifyTrackId(id) ? id : "";
  }
}

function toSpotifyTrackUrl(inputUrl: string) {
  const id = extractSpotifyTrackId(inputUrl);
  return id ? `https://open.spotify.com/track/${id}` : "";
}

function isSpotifyTrackId(value: string) {
  return /^[A-Za-z0-9]{22}$/.test(value);
}

function splitSpotifyOEmbedTitle(rawTitle: string) {
  const cleaned = rawTitle.replace(/\s+/g, " ").trim();
  const withoutTail = cleaned
    .replace(/\s*\|\s*Spotify\s*$/i, "")
    .replace(/\s+on\s+Spotify\s*$/i, "")
    .trim();

  const songAndLyricsMatch = withoutTail.match(/^(.+?)\s+-\s+song\s+and\s+lyrics\s+by\s+(.+)$/i);
  if (songAndLyricsMatch) {
    return {
      title: songAndLyricsMatch[1].trim(),
      artist: songAndLyricsMatch[2].trim()
    };
  }

  const songByMatch = withoutTail.match(/^(.+?)\s+-\s+song\s+by\s+(.+)$/i);
  if (songByMatch) {
    return {
      title: songByMatch[1].trim(),
      artist: songByMatch[2].trim()
    };
  }

  const byMatch = withoutTail.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return {
      title: byMatch[1].trim(),
      artist: byMatch[2].trim()
    };
  }

  const parsed = splitTitleAndArtist(withoutTail, "spotify");
  return {
    title: parsed.title,
    artist: parsed.artist
  };
}

function normalizeForCompare(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function cleanSpotifyArtist(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
