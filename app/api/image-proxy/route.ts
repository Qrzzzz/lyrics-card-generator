import { fetchPublicUrl, readBytesWithLimit } from "@/lib/safe-fetch";

export const runtime = "nodejs";

const IMAGE_LIMIT = 8 * 1024 * 1024;

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const imageUrl = requestUrl.searchParams.get("url") || "";

  try {
    const { response: res } = await fetchPublicUrl(imageUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 LyricGlassCard/1.0"
      },
      timeoutMs: 8000
    });

    if (!res.ok) {
      return Response.json({ ok: false, error: `Image returned HTTP ${res.status}.` }, { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return Response.json({ ok: false, error: "The proxied resource is not an image." }, { status: 400 });
    }

    const bytes = await readBytesWithLimit(res, IMAGE_LIMIT);

    return new Response(bytes, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to proxy this image.";
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
