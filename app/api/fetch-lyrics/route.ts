import { rankLyricsCandidate } from "@/lib/lyrics";
import { appApiErrorResponse, appLimitedJsonErrorResponse, appUpstreamErrorResponse } from "@/lib/app-api-errors";
import { appMutationRejectionResponse, validateAppMutationRequest } from "@/lib/app-request";
import { readLimitedJson } from "@/lib/json-request";
import { readResponseJsonBounded } from "@/lib/bounded-response";
import { withUpstreamDeadline } from "@/lib/upstream-control";
import resourceBudgets from "@/electron/resource-budgets.json";
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

  const bodyResult = await readLimitedJson<unknown>(req, resourceBudgets.jsonRequestBytes.fetchLyrics);
  if (!bodyResult.ok) return appLimitedJsonErrorResponse(bodyResult.reason);

  const parsed = schema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return appApiErrorResponse("invalid_request", 400);
  }

  try {
    const params = new URLSearchParams({ track_name: parsed.data.title });
    if (parsed.data.artist.trim()) {
      params.set("artist_name", parsed.data.artist);
    }
    const records = await withUpstreamDeadline(
      req.signal,
      resourceBudgets.upstreamTimeoutMs.lrclib,
      async (signal) => {
        const res = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
          headers: {
            "user-agent": "LyricsCardGenerator/2.0.0 (local desktop app)"
          },
          signal
        });
        if (!res.ok) throw new Error(`LRCLIB returned HTTP ${res.status}.`);
        return readResponseJsonBounded<LrclibRecord[]>(
          res,
          resourceBudgets.upstreamResponseBytes.lrclibSearch,
          signal
        );
      }
    );
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
  } catch (error) {
    return appUpstreamErrorResponse(error, "lyrics_fetch_failed");
  }
}
