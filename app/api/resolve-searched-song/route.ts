import { resolveNeteaseSong } from "@/lib/music-search/netease";
import { appApiErrorResponse } from "@/lib/app-api-errors";
import { appMutationRejectionResponse, validateAppMutationRequest } from "@/lib/app-request";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  source: z.literal("netease").optional().default("netease"),
  id: z.string().regex(/^\d+$/).max(32)
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
    const data = await resolveNeteaseSong(parsed.data.id);
    return Response.json({ ok: true, data });
  } catch {
    return appApiErrorResponse("song_resolve_failed", 502);
  }
}
