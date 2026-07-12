import * as cheerio from "cheerio";
import { getHighResolutionCoverUrl } from "@/lib/cover-url";
import { safeFetch } from "@/lib/safe-fetch";
import type { SongInfo, SongSource } from "@/lib/types";

export type ExtractedMeta = {
  rawTitle: string;
  description: string;
  image: string;
};

export const REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,text/plain,*/*;q=0.8",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
} as const;

const HTML_LIMIT = 2 * 1024 * 1024;

const PLATFORM_TAILS = [
  "Apple Music",
  "QQ Music",
  "QQ音乐",
  "网易云音乐",
  "NetEase Cloud Music",
  "Netease Music",
  "NetEase Music",
  "Spotify",
  "单曲",
  "专辑",
  "歌曲",
  "Music",
  "y.qq.com"
];

export async function fetchHtml(
  url: string,
  init?: Pick<RequestInit, "headers" | "signal">
): Promise<{ html: string; finalUrl: string }> {
  const res = await safeFetch(url, {
    headers: { ...REQUEST_HEADERS, ...(init?.headers ?? {}) },
    signal: init?.signal ?? undefined,
    timeoutMs: 10000,
    maxRedirects: 5,
    maxResponseBytes: HTML_LIMIT,
    allowedContentTypes: ["text/html", "application/xhtml+xml"]
  });

  if (!res.ok) {
    throw new Error(`The song page returned HTTP ${res.status}.`);
  }

  return {
    html: res.text(),
    finalUrl: res.url || url
  };
}

export async function fetchJson<T>(url: string, init?: Pick<RequestInit, "headers" | "signal">): Promise<T> {
  const res = await safeFetch(url, {
    headers: {
      ...REQUEST_HEADERS,
      accept: "application/json,text/plain,*/*",
      ...(init?.headers ?? {})
    },
    signal: init?.signal ?? undefined,
    timeoutMs: 10000,
    maxRedirects: 5,
    maxResponseBytes: HTML_LIMIT,
    allowedContentTypes: ["application/json", "text/json", "text/plain", "application/javascript"]
  });

  if (!res.ok) {
    throw new Error(`The JSON endpoint returned HTTP ${res.status}.`);
  }

  return res.json<T>();
}

export function extractMeta(html: string, baseUrl: string): ExtractedMeta {
  const $ = cheerio.load(html);
  const getMeta = (name: string) =>
    $(`meta[property="${name}"]`).attr("content") ||
    $(`meta[name="${name}"]`).attr("content") ||
    "";

  return {
    rawTitle: cleanTitle(getMeta("og:title") || getMeta("twitter:title") || $("title").first().text() || ""),
    description: cleanDescription(
      getMeta("og:description") ||
        getMeta("twitter:description") ||
        $("meta[name='description']").attr("content") ||
        ""
    ),
    image: absolutizeUrl(getMeta("og:image") || getMeta("twitter:image"), baseUrl)
  };
}

export function buildSongInfo({
  source,
  title,
  artist,
  album,
  coverUrl,
  originalUrl,
  finalUrl,
  parseMethod
}: {
  source: SongSource;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  originalUrl: string;
  finalUrl: string;
  parseMethod: string;
}): SongInfo {
  const cleanCover = coverUrl ? getHighResolutionCoverUrl(coverUrl, source) : "";

  return {
    source,
    title: cleanTitle(title) || "Untitled",
    artist: cleanArtistName(artist),
    album: album?.trim() || "",
    originalCoverUrl: coverUrl || "",
    coverUrl: cleanCover,
    originalUrl,
    finalUrl,
    parseMethod
  };
}

export function songInfoFromMeta({
  source,
  html,
  url,
  originalUrl,
  parseMethod
}: {
  source: SongSource;
  html: string;
  url: string;
  originalUrl: string;
  parseMethod: string;
}) {
  const meta = extractMeta(html, url);
  const parsedTitle = splitTitleAndArtist(meta.rawTitle, source);
  const descriptionArtist = extractArtistFromDescription(meta.description);

  if (!parsedTitle.title && !meta.image) {
    throw new Error("No usable song metadata was found.");
  }

  return buildSongInfo({
    source,
    title: parsedTitle.title,
    artist: parsedTitle.artist || descriptionArtist,
    coverUrl: meta.image,
    originalUrl,
    finalUrl: url,
    parseMethod
  });
}

export function splitTitleAndArtist(rawTitle: string, source: SongSource) {
  const cleaned = removePlatformSuffix(stripPlatformTail(cleanTitle(rawTitle), source));

  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return {
      title: stripReleaseTail(byMatch[1]),
      artist: cleanArtistName(stripPlatformTail(byMatch[2], source))
    };
  }

  const separators = [" - ", " – ", " — ", "_", " / ", "-"];
  for (const separator of separators) {
    if (cleaned.includes(separator)) {
      const [title, ...rest] = cleaned.split(separator);
      const artist = rest.join(separator).trim();
      if (title.trim() && artist) {
        return {
          title: stripReleaseTail(title),
          artist: cleanArtistName(stripPlatformTail(artist, source))
        };
      }
    }
  }

  return {
    title: cleaned || "Untitled",
    artist: ""
  };
}

export function cleanTitle(title: string) {
  return title.replace(/\s+/g, " ").replace(/\|/g, " - ").trim();
}

export function cleanArtistName(artist: string) {
  return artist
    .replace(/\s+on\s+Apple Music\s*$/i, "")
    .replace(/\s+on\s*$/i, "")
    .replace(/\s*(-|\||“|”)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanDescription(description: string) {
  return description.replace(/\s+/g, " ").trim();
}

export function extractArtistFromDescription(description: string) {
  const byMatch = description.match(/\bby\s+([^,.;，。；]+)/i);
  if (byMatch?.[1]) {
    return cleanArtistName(byMatch[1]);
  }

  const singerMatch = description.match(/(?:歌手|演唱|Singer)[:：]\s*([^,.;，。；]+)/i);
  return singerMatch?.[1] ? cleanArtistName(singerMatch[1]) : "";
}

export function absolutizeUrl(value: string, baseUrl: string) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function stripReleaseTail(title: string) {
  return title.replace(/\s+[-–—]\s+(Single|EP|Album|单曲|专辑)$/i, "").trim();
}

function stripPlatformTail(value: string, source: SongSource) {
  let result = value.trim();
  const tails = source === "unknown" ? PLATFORM_TAILS : PLATFORM_TAILS;

  for (const tail of tails) {
    result = result
      .replace(new RegExp(`\\s+on\\s+${escapeRegExp(tail)}\\s*$`, "i"), "")
      .replace(new RegExp(`\\s*(-|_|/|\\||“|”)\\s*${escapeRegExp(tail)}\\s*$`, "i"), "")
      .replace(new RegExp(`\\s*${escapeRegExp(tail)}\\s*$`, "i"), "");
  }

  return cleanArtistName(result);
}

function removePlatformSuffix(raw: string) {
  let result = raw.trim();

  for (const tail of PLATFORM_TAILS) {
    result = result
      .replace(new RegExp(`\\s+on\\s+${escapeRegExp(tail)}\\s*$`, "i"), "")
      .replace(new RegExp(`\\s*(-|_|/|\\||“|”)\\s*${escapeRegExp(tail)}\\s*$`, "i"), "")
      .replace(new RegExp(`\\s*${escapeRegExp(tail)}\\s*$`, "i"), "");
  }

  return result.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
