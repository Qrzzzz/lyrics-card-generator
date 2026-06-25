import { parseAppleMusic } from "@/lib/parsers/apple";
import { parseNetease } from "@/lib/parsers/netease";
import { parseQQMusic } from "@/lib/parsers/qq";
import { fetchHtml, REQUEST_HEADERS, songInfoFromMeta } from "@/lib/parsers/shared";
import { extractSpotifyTrackId, parseSpotify } from "@/lib/parsers/spotify";
import type { SongInfo, SongSource } from "@/lib/types";
import { extractFirstUrl } from "@/lib/url-normalize";
import { validatePublicHttpUrl } from "@/lib/url-safety";

export type ParseDebugDetails = {
  input: string;
  extractedUrl?: string;
  finalUrl?: string;
  detectedSource?: SongSource;
  triedMethods: string[];
  error?: string;
};

export class SongParseError extends Error {
  details: ParseDebugDetails;

  constructor(message: string, details: ParseDebugDetails) {
    super(message);
    this.name = "SongParseError";
    this.details = details;
  }
}

export async function parseSong(input: string): Promise<SongInfo> {
  const triedMethods: string[] = [];
  const rawUrl = extractFirstUrl(input);
  const details: ParseDebugDetails = {
    input,
    extractedUrl: rawUrl || undefined,
    triedMethods
  };

  if (!rawUrl) {
    throw new SongParseError("No URL was found in the input.", details);
  }

  const rawSafety = await validatePublicHttpUrl(rawUrl);
  if (!rawSafety.ok) {
    throw new SongParseError(rawSafety.error, details);
  }

  let finalUrl = rawSafety.url.toString();
  try {
    triedMethods.push("resolve-redirect");
    finalUrl = await resolveRedirect(finalUrl);
  } catch (error) {
    details.error = error instanceof Error ? error.message : "Unable to resolve redirects.";
  }

  const finalSafety = await validatePublicHttpUrl(finalUrl);
  if (!finalSafety.ok) {
    throw new SongParseError(finalSafety.error, { ...details, finalUrl });
  }

  finalUrl = finalSafety.url.toString();
  const source = detectSource(finalUrl) !== "unknown" ? detectSource(finalUrl) : detectSource(rawUrl);
  details.finalUrl = finalUrl;
  details.detectedSource = source;

  try {
    if (source === "netease") {
      triedMethods.push("netease-adapter");
      return await parseNetease(finalUrl, rawUrl);
    }

    if (source === "qq") {
      triedMethods.push("qq-adapter");
      return await parseQQMusic(finalUrl, rawUrl);
    }

    if (source === "apple") {
      triedMethods.push("apple-adapter");
      return await parseAppleMusic(finalUrl, rawUrl);
    }

    if (source === "spotify") {
      triedMethods.push("spotify-adapter");
      return await parseSpotify(finalUrl, rawUrl);
    }
  } catch (error) {
    details.error = error instanceof Error ? error.message : "Platform parser failed.";
  }

  try {
    triedMethods.push("generic-og");
    return await parseGenericOpenGraph(finalUrl, rawUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse this link.";
    throw new SongParseError(message, { ...details, error: message });
  }
}

export function detectSource(inputUrl: string): SongSource {
  const hostname = safeHost(inputUrl);

  if (hostname === "music.apple.com" || hostname.endsWith(".music.apple.com")) {
    return "apple";
  }

  if ((hostname === "open.spotify.com" || hostname === "play.spotify.com") && extractSpotifyTrackId(inputUrl)) {
    return "spotify";
  }

  if (
    hostname === "spotify.link" ||
    hostname.endsWith(".spotify.link") ||
    hostname === "spotify.app.link" ||
    hostname.endsWith(".spotify.app.link")
  ) {
    return "spotify";
  }

  if (
    hostname === "music.163.com" ||
    hostname === "y.music.163.com" ||
    hostname.endsWith(".music.163.com") ||
    hostname === "163cn.tv" ||
    hostname.endsWith(".163cn.tv")
  ) {
    return "netease";
  }

  if (
    hostname === "y.qq.com" ||
    hostname === "c.y.qq.com" ||
    hostname === "i.y.qq.com" ||
    hostname === "u.y.qq.com" ||
    hostname.endsWith(".y.qq.com") ||
    hostname.endsWith(".qq.com")
  ) {
    return "qq";
  }

  return "unknown";
}

export async function resolveRedirect(url: string) {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    method: "GET",
    redirect: "follow"
  });

  response.body?.cancel().catch(() => undefined);
  return response.url || url;
}

export async function parseGenericOpenGraph(finalUrl: string, originalUrl = finalUrl) {
  const source = detectSource(finalUrl);
  const { html, finalUrl: fetchedFinalUrl } = await fetchHtml(finalUrl);

  return songInfoFromMeta({
    source,
    html,
    url: fetchedFinalUrl || finalUrl,
    originalUrl,
    parseMethod: "generic-og"
  });
}

export { extractMeta, splitTitleAndArtist } from "@/lib/parsers/shared";

function safeHost(inputUrl: string) {
  try {
    return new URL(inputUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}
