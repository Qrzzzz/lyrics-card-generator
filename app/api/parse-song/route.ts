import { parseSong, SongParseError } from "@/lib/song-parser";
import { appApiErrorResponse, appLimitedJsonErrorResponse } from "@/lib/app-api-errors";
import { appMutationRejectionResponse, validateAppMutationRequest } from "@/lib/app-request";
import { readLimitedJson } from "@/lib/json-request";
import { SafeFetchError } from "@/lib/safe-fetch";
import resourceBudgets from "@/electron/resource-budgets.json";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  url: z.string().min(1).max(8192)
});

export async function POST(req: Request) {
  const rejection = validateAppMutationRequest(req, "application/json");
  if (rejection) {
    return appMutationRejectionResponse(rejection);
  }

  const bodyResult = await readLimitedJson<unknown>(req, resourceBudgets.jsonRequestBytes.parseSong);
  if (!bodyResult.ok) return appLimitedJsonErrorResponse(bodyResult.reason);

  const parsed = schema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return appApiErrorResponse("invalid_request", 400);
  }

  try {
    const data = await parseSong(parsed.data.url, { signal: req.signal });
    return Response.json({ ok: true, data });
  } catch (error) {
    if (req.signal.aborted) {
      return appApiErrorResponse("client_cancelled", 499);
    }
    const safeFetchError = error instanceof SafeFetchError
      ? error
      : error instanceof SongParseError && error.cause instanceof SafeFetchError
        ? error.cause
        : null;
    if (safeFetchError?.code === "TIMEOUT") {
      return appApiErrorResponse("upstream_timeout", 504);
    }
    if (safeFetchError?.code === "BODY_TOO_LARGE") {
      return appApiErrorResponse("upstream_response_too_large", 502);
    }
    if (error instanceof SongParseError) {
      return appApiErrorResponse("song_parse_failed", 502, { details: error.details });
    }

    return appApiErrorResponse("song_parse_failed", 502);
  }
}
