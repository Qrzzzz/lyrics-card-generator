export function proxiedImageUrl(url?: string) {
  // Web Lite has no desktop proxy; callers must validate direct URLs for CORS-safe export.
  return url ?? "";
}
