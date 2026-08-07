export function proxiedImageUrl(url?: string) {
  if (!url) {
    return "";
  }

  // Preserve the URL prefixes this renderer path treats as directly loadable.
  // Inputs outside this compatibility allowlist are encoded for the proxy route.
  if (
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("file:") ||
    url.startsWith("filesystem:") ||
    url.startsWith("/") ||
    url.startsWith("http://localhost") ||
    url.startsWith("https://localhost") ||
    url.startsWith("http://127.0.0.1") ||
    url.startsWith("https://127.0.0.1")
  ) {
    return url;
  }

  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}
