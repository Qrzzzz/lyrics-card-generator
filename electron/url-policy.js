const ALLOWED_EXTERNAL_HOSTS = new Set(["github.com", "www.github.com"]);

function parseUrl(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isAllowedLocalNavigation(targetUrl, localAppUrl) {
  const target = parseUrl(targetUrl);
  const local = parseUrl(localAppUrl);
  return Boolean(target && local && target.origin === local.origin && (target.protocol === "http:" || target.protocol === "https:"));
}

function parseAllowedExternalUrl(targetUrl) {
  const parsed = parseUrl(targetUrl);
  if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_EXTERNAL_HOSTS.has(hostname)) return null;
  return parsed;
}

module.exports = {
  isAllowedLocalNavigation,
  parseAllowedExternalUrl
};
