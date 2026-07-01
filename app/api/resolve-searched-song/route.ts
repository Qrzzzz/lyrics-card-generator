import { resolveNeteaseSong } from "@/lib/music-search/netease";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  source: z.literal("netease").optional().default("netease"),
  id: z.string().regex(/^\d+$/).max(32)
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  try {
    const data = await resolveNeteaseSong(parsed.data.id);
    return Response.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve this song.";
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
