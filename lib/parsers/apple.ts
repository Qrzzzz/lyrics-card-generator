import { buildSongInfo, fetchHtml, fetchJson, songInfoFromMeta } from "@/lib/parsers/shared";

type AppleLookupResponse = {
  resultCount?: number;
  results?: Array<{
    trackName?: string;
    artistName?: string;
    collectionName?: string;
    artworkUrl100?: string;
    artworkUrl600?: string;
    trackViewUrl?: string;
  }>;
};

export async function parseAppleMusic(finalUrl: string, originalUrl: string) {
  const lookupId = extractAppleTrackId(originalUrl) || extractAppleTrackId(finalUrl);
  if (lookupId) {
    try {
      return await parseAppleLookup(lookupId.id, lookupId.country, finalUrl, originalUrl);
    } catch {
      // Continue to OG fallback below.
    }
  }

  const { html, finalUrl: fetchedFinalUrl } = await fetchHtml(finalUrl);

  return songInfoFromMeta({
    source: "apple",
    html,
    url: fetchedFinalUrl || finalUrl,
    originalUrl,
    parseMethod: "apple-og"
  });
}

export function extractAppleTrackId(inputUrl: string) {
  try {
    const url = new URL(inputUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const country = parts[0] && /^[a-z]{2}$/i.test(parts[0]) ? parts[0].toLowerCase() : "us";
    const iParam = url.searchParams.get("i");
    const pathId = parts.findLast((part) => /^\d+$/.test(part));
    const id = iParam || pathId || "";

    return id ? { id, country } : null;
  } catch {
    return null;
  }
}

async function parseAppleLookup(id: string, country: string, finalUrl: string, originalUrl: string) {
  const data = await fetchJson<AppleLookupResponse>(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song&country=${encodeURIComponent(country)}`
  );
  const song = data.results?.[0];

  if (!song?.trackName) {
    throw new Error("Apple lookup did not return song metadata.");
  }

  return buildSongInfo({
    source: "apple",
    title: song.trackName,
    artist: song.artistName || "",
    album: song.collectionName || "",
    coverUrl: song.artworkUrl600 || song.artworkUrl100 || "",
    originalUrl,
    finalUrl: song.trackViewUrl || originalUrl || finalUrl,
    parseMethod: "apple-lookup"
  });
}
