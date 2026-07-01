import { searchNeteaseSongs } from "@/lib/music-search/netease";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  keyword: z.string().min(1).max(120),
  limit: z.number().int().min(1).max(20).optional().default(8)
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

  const keyword = parsed.data.keyword.trim();
  if (!keyword) {
    return Response.json({ ok: true, data: [] });
  }

  try {
    const data = await searchNeteaseSongs(keyword, parsed.data.limit);
    return Response.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to search songs.";
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
