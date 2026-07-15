import { searchNeteaseSongs } from "@/lib/music-search/netease";
import { appApiErrorResponse } from "@/lib/app-api-errors";
import { appMutationRejectionResponse, validateAppMutationRequest } from "@/lib/app-request";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  keyword: z.string().min(1).max(120),
  limit: z.number().int().min(1).max(20).optional().default(8)
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

  const keyword = parsed.data.keyword.trim();
  if (!keyword) {
    return Response.json({ ok: true, data: [] });
  }

  try {
    const data = await searchNeteaseSongs(keyword, parsed.data.limit);
    return Response.json({ ok: true, data });
  } catch {
    return appApiErrorResponse("song_search_failed", 502);
  }
}
