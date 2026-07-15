import { parseSong, SongParseError } from "@/lib/song-parser";
import { appApiErrorResponse } from "@/lib/app-api-errors";
import { appMutationRejectionResponse, validateAppMutationRequest } from "@/lib/app-request";
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
    const data = await parseSong(parsed.data.url);
    return Response.json({ ok: true, data });
  } catch (error) {
    if (error instanceof SongParseError) {
      return appApiErrorResponse("song_parse_failed", 502, { details: error.details });
    }

    return appApiErrorResponse("song_parse_failed", 502);
  }
}
