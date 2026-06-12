import { validatePublicHttpUrl } from "@/lib/url-safety";

export const runtime = "nodejs";

const IMAGE_LIMIT = 8 * 1024 * 1024;

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const imageUrl = requestUrl.searchParams.get("url") || "";

  const safety = await validatePublicHttpUrl(imageUrl);
  if (!safety.ok) {
    return Response.json({ ok: false, error: safety.error }, { status: 400 });
  }

  try {
    const res = await fetch(safety.url.toString(), {
      headers: {
        "user-agent": "Mozilla/5.0 LyricGlassCard/1.0"
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow"
    });

    if (!res.ok) {
      return Response.json({ ok: false, error: `Image returned HTTP ${res.status}.` }, { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return Response.json({ ok: false, error: "The proxied resource is not an image." }, { status: 400 });
    }

    const bytes = await limitedBinaryRead(res, IMAGE_LIMIT);

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

async function limitedBinaryRead(res: Response, limit: number) {
  if (!res.body) {
    return new Uint8Array();
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    received += value.byteLength;
    if (received > limit) {
      reader.cancel().catch(() => undefined);
      throw new Error("The image response is too large.");
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}
