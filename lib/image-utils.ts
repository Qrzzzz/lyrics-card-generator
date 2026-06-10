export function proxiedImageUrl(url?: string) {
  if (!url) {
    return "";
  }

  if (
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("/") ||
    url.startsWith("http://localhost") ||
    url.startsWith("https://localhost")
  ) {
    return url;
  }

  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}
