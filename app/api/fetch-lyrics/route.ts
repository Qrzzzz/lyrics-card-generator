import { rankLyricsCandidate } from "@/lib/lyrics";
import { appApiErrorResponse } from "@/lib/app-api-errors";
import { appMutationRejectionResponse, validateAppMutationRequest } from "@/lib/app-request";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  source: z.enum(["qq", "netease", "apple", "spotify", "unknown"]),
  url: z.string().max(2048).optional(),
  title: z.string().min(1).max(240),
  artist: z.string().max(240).optional().default("")
});

type LrclibRecord = {
  id: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

export async function POST(req: Request) {
  const rejection = validateAppMutationRequest(req, "application/json");
  if (rejection) {
    return appMutationRejectionResponse(rejection);
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return appApiErrorResponse("invalid_json", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return appApiErrorResponse("invalid_request", 400);
  }

  try {
    const params = new URLSearchParams({ track_name: parsed.data.title });
    if (parsed.data.artist.trim()) {
      params.set("artist_name", parsed.data.artist);
    }
    const res = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
      headers: {
        "user-agent": "LyricsCardGenerator/2.0.0 (local desktop app)"
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      return appApiErrorResponse("lyrics_fetch_failed", 502);
    }

    const records = (await res.json()) as LrclibRecord[];
    // LRCLIB results are untrusted search candidates; discard weak identity
    // matches before selecting the highest-confidence lyric payload.
    const candidates = records
      .map((record) => rankLyricsCandidate(record, parsed.data.title, parsed.data.artist))
      .filter((candidate) => candidate !== null)
      .sort((a, b) => b.confidence - a.confidence);

    const best = candidates[0];
    if (!best) {
      return appApiErrorResponse("lyrics_fetch_failed", 404);
    }

    return Response.json({ ok: true, data: best });
  } catch {
    return appApiErrorResponse("lyrics_fetch_failed", 502);
  }
}
