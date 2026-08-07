const ALLOWED_EXTERNAL_HOSTS = new Set(["github.com", "www.github.com"]);

function parseUrl(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// Renderer navigation stays on the exact app origin, including its per-launch loopback port.
function isAllowedLocalNavigation(targetUrl, localAppUrl) {
  const target = parseUrl(targetUrl);
  const local = parseUrl(localAppUrl);
  return Boolean(target && local && target.origin === local.origin && (target.protocol === "http:" || target.protocol === "https:"));
}

// External navigation is intentionally narrower: HTTPS, no embedded credentials, and an explicit host allowlist.
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
