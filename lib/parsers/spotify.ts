import * as cheerio from "cheerio";
import {
  buildSongInfo,
  extractMeta,
  fetchHtml,
  fetchJson
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

  const html = await fetchSpotifyMetadataHtml(finalUrl);
  const parsed = resolveSpotifyMetadata(rawTitle, html);

  return buildSongInfo({
    source: "spotify",
    title: parsed.title,
    artist: parsed.artist,
    coverUrl,
    originalUrl,
    finalUrl,
    parseMethod: "spotify-oembed"
  });
}

async function parseSpotifyOpenGraph(finalUrl: string, originalUrl: string) {
  const { html, finalUrl: fetchedFinalUrl } = await fetchSpotifyHtml(finalUrl);
  const meta = extractMeta(html, fetchedFinalUrl || finalUrl);
  const parsed = resolveSpotifyMetadata(meta.rawTitle, html);

  if (!parsed.title && !meta.image) {
    throw new Error("No usable song metadata was found.");
  }

  return buildSongInfo({
    source: "spotify",
    title: parsed.title,
    artist: parsed.artist,
    coverUrl: meta.image,
    originalUrl,
    finalUrl: fetchedFinalUrl || finalUrl,
    parseMethod: "spotify-og"
  });
}

async function fetchSpotifyMetadataHtml(finalUrl: string) {
  try {
    const { html } = await fetchSpotifyHtml(finalUrl);
    return html;
  } catch {
    return "";
  }
}

async function fetchSpotifyHtml(url: string) {
  return fetchHtml(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "text/html,*/*;q=0.8"
    }
  });
}

function extractSpotifyArtistFromHtml(html: string, title: string) {
  if (!html) {
    return "";
  }

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

  const summaryDescriptions = [
    $('meta[property="og:description"]').attr("content") || "",
    $('meta[name="twitter:description"]').attr("content") || ""
  ];
  for (const summary of summaryDescriptions) {
    const artist = extractSpotifyArtistFromDescription(summary);
    if (artist) {
      return artist;
    }
  }

  const titleCandidates = [
    $("title").first().text(),
    $('meta[property="og:title"]').attr("content") || "",
    $('meta[name="twitter:title"]').attr("content") || ""
  ];
  for (const candidate of titleCandidates) {
    const artist = splitExplicitSpotifyTitle(candidate).artist;
    if (artist) {
      return artist;
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

export function resolveSpotifyMetadata(rawTitle: string, html = "") {
  // Structured HTML evidence outranks title-derived artist text. A suffix is
  // removed from the title only when it exactly matches that confirmed artist.
  const parsed = splitExplicitSpotifyTitle(rawTitle);
  const artist = extractSpotifyArtistFromHtml(html, parsed.title) || parsed.artist;

  return {
    title: stripConfirmedArtistSuffix(parsed.title, artist),
    artist
  };
}

function splitExplicitSpotifyTitle(rawTitle: string) {
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

  return {
    title: withoutTail,
    artist: ""
  };
}

function stripConfirmedArtistSuffix(title: string, artist: string) {
  if (!title || !artist) {
    return title;
  }

  for (const separator of [" - ", " by "]) {
    const separatorIndex = title.toLowerCase().lastIndexOf(separator);
    if (separatorIndex <= 0) {
      continue;
    }

    const suffix = title.slice(separatorIndex + separator.length);
    if (normalizeForCompare(suffix) === normalizeForCompare(artist)) {
      return title.slice(0, separatorIndex).trim();
    }
  }

  return title;
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
