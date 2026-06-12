import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type UrlSafety =
  | { ok: true; url: URL }
  | { ok: false; error: string };

const LOCAL_HOSTS = new Set(["localhost", "0.0.0.0", "127.0.0.1", "::1", "[::1]"]);

export async function validatePublicHttpUrl(rawUrl: string): Promise<UrlSafety> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Please enter a valid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are supported." };
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname) {
    return { ok: false, error: "The URL hostname is empty." };
  }

  if (isBlockedHostname(hostname)) {
    return { ok: false, error: "Private or local network URLs are not allowed." };
  }

  if (isIP(hostname) && isPrivateIp(hostname)) {
    return { ok: false, error: "Private or local network IP addresses are not allowed." };
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (addresses.some((address) => isPrivateIp(address.address))) {
      return { ok: false, error: "The URL resolves to a private network address." };
    }
  } catch {
    return { ok: false, error: "Unable to resolve the URL host." };
  }

  return { ok: true, url };
}

function isBlockedHostname(hostname: string) {
  if (LOCAL_HOSTS.has(hostname)) {
    return true;
  }

  if (hostname.endsWith(".localhost")) {
    return true;
  }

  if (hostname.startsWith("127.") || hostname.startsWith("10.") || hostname.startsWith("192.168.")) {
    return true;
  }

  const parts = hostname.split(".");
  if (parts.length >= 2 && parts[0] === "172") {
    const second = Number(parts[1]);
    if (Number.isInteger(second) && second >= 16 && second <= 31) {
      return true;
    }
  }

  return hostname === "169.254.169.254";
}

function isPrivateIp(ip: string) {
  if (ip.includes(":")) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
