import { MAX_INLINE_COVER_BYTES } from "./cover-image-limits";
export { MAX_INLINE_COVER_BYTES } from "./cover-image-limits";

export function proxiedImageUrl(url?: string, appOrigin = typeof window === "undefined" ? "" : (window.location?.origin ?? "")) {
  if (!url || /[\u0000-\u0020\u007f\\]/u.test(url)) return "";
  if (url.startsWith("data:")) {
    const match = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,([A-Za-z0-9+/]*={0,2})$/u.exec(url);
    if (!match || !match[1].length || match[1].length % 4 !== 0) return "";
    const bytes = match[1].length / 4 * 3 - (match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0);
    return bytes <= MAX_INLINE_COVER_BYTES ? url : "";
  }
  let parsed: URL;
  try {
    parsed = new URL(url, appOrigin || "https://image.invalid");
  } catch {
    return "";
  }
  if (parsed.protocol === "blob:") {
    // Blobs are created by our upload flow; their byte budget is enforced there.
    return appOrigin && parsed.origin === appOrigin ? url : "";
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (appOrigin && parsed.origin === appOrigin) return url;
  return `/api/image-proxy?url=${encodeURIComponent(parsed.href)}`;
}
