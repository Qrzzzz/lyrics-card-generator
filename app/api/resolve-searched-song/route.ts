import { resolveNeteaseSong } from "@/lib/music-search/netease";
import { appApiErrorResponse, appLimitedJsonErrorResponse, appUpstreamErrorResponse } from "@/lib/app-api-errors";
import { appMutationRejectionResponse, validateAppMutationRequest } from "@/lib/app-request";
import { readLimitedJson } from "@/lib/json-request";
import resourceBudgets from "@/electron/resource-budgets.json";
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

  const bodyResult = await readLimitedJson<unknown>(req, resourceBudgets.jsonRequestBytes.resolveSearchedSong);
  if (!bodyResult.ok) return appLimitedJsonErrorResponse(bodyResult.reason);

  const parsed = schema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return appApiErrorResponse("invalid_request", 400);
  }

  try {
    const data = await resolveNeteaseSong(parsed.data.id, { signal: req.signal });
    return Response.json({ ok: true, data });
  } catch (error) {
    return appUpstreamErrorResponse(error, "song_resolve_failed");
  }
}
