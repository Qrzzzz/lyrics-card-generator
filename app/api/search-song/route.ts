import { searchNeteaseSongs } from "@/lib/music-search/netease";
import { appApiErrorResponse, appLimitedJsonErrorResponse, appUpstreamErrorResponse } from "@/lib/app-api-errors";
import { appMutationRejectionResponse, validateAppMutationRequest } from "@/lib/app-request";
import { readLimitedJson } from "@/lib/json-request";
import resourceBudgets from "@/electron/resource-budgets.json";
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

  const bodyResult = await readLimitedJson<unknown>(req, resourceBudgets.jsonRequestBytes.searchSong);
  if (!bodyResult.ok) return appLimitedJsonErrorResponse(bodyResult.reason);

  const parsed = schema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return appApiErrorResponse("invalid_request", 400);
  }

  const keyword = parsed.data.keyword.trim();
  if (!keyword) {
    return Response.json({ ok: true, data: [] });
  }

  try {
    const data = await searchNeteaseSongs(keyword, parsed.data.limit, { signal: req.signal });
    return Response.json({ ok: true, data });
  } catch (error) {
    return appUpstreamErrorResponse(error, "song_search_failed");
  }
}
