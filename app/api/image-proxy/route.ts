import { safeFetch } from "@/lib/safe-fetch";

export const runtime = "nodejs";

const IMAGE_LIMIT = 8 * 1024 * 1024;

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const imageUrl = requestUrl.searchParams.get("url") || "";

  try {
    const res = await safeFetch(imageUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 LyricsCardGenerator/2.0.0"
      },
      timeoutMs: 8000,
      maxRedirects: 5,
      maxResponseBytes: IMAGE_LIMIT,
      allowedContentTypes: ["image/"]
    });

    if (!res.ok) {
      return Response.json({ ok: false, error: `Image returned HTTP ${res.status}.` }, { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "application/octet-stream";

    return new Response(Uint8Array.from(res.body).buffer, {
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
