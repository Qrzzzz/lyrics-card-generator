import { parseSong, SongParseError } from "@/lib/song-parser";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  url: z.string().min(1).max(8192)
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
    const data = await parseSong(parsed.data.url);
    return Response.json({ ok: true, data });
  } catch (error) {
    if (error instanceof SongParseError) {
      return Response.json(
        {
          ok: false,
          error: "Could not parse this link automatically. You can still enter the title, artist, and cover manually.",
          details: error.details
        },
        { status: 502 }
      );
    }

    const message = error instanceof Error ? error.message : "Unable to parse this link.";
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
