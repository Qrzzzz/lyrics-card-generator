import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type PublicUrlValidation =
  | { ok: true; url: URL; addresses: ResolvedAddress[] }
  | { ok: false; error: string };

export type PublicUrlResolver = (hostname: string) => Promise<ResolvedAddress[]>;

const IPV4_BLOCKED_RANGES: Array<[number, number]> = [
  [0x00000000, 8], // current network
  [0x0a000000, 8], // private
  [0x64400000, 10], // carrier-grade NAT
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local
  [0xac100000, 12], // private
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0000200, 24], // documentation
  [0xc0586300, 24], // deprecated 6to4 relay anycast
  [0xc0a80000, 16], // private
  [0xc6120000, 15], // benchmarking
  [0xc6336400, 24], // documentation
  [0xcb007100, 24], // documentation
  [0xe0000000, 4], // multicast
  [0xf0000000, 4] // reserved / limited broadcast
];

// IANA IPv6 Global Unicast Address Space entries with ALLOCATED status.
// Unlisted space inside 2000::/3 remains reserved by IANA and must not be
// treated as a routable public target.
const IPV6_ALLOCATED_RANGES: Array<[string, number]> = [
  ["2001::", 23],
  ["2001:200::", 23],
  ["2001:400::", 23],
  ["2001:600::", 23],
  ["2001:800::", 22],
  ["2001:c00::", 23],
  ["2001:e00::", 23],
  ["2001:1200::", 23],
  ["2001:1400::", 22],
  ["2001:1800::", 23],
  ["2001:1a00::", 23],
  ["2001:1c00::", 22],
  ["2001:2000::", 19],
  ["2001:4000::", 23],
  ["2001:4200::", 23],
  ["2001:4400::", 23],
  ["2001:4600::", 23],
  ["2001:4800::", 23],
  ["2001:4a00::", 23],
  ["2001:4c00::", 23],
  ["2001:5000::", 20],
  ["2001:8000::", 19],
  ["2001:a000::", 20],
  ["2001:b000::", 20],
  ["2002::", 16],
  ["2003::", 18],
  ["2400::", 12],
  ["2410::", 12],
  ["2600::", 12],
  ["2610::", 23],
  ["2620::", 23],
  ["2630::", 12],
  ["2800::", 12],
  ["2a00::", 12],
  ["2a10::", 12],
  ["2c00::", 12]
];

export async function validatePublicHttpUrl(
  rawUrl: string,
  options: { resolver?: PublicUrlResolver } = {}
): Promise<PublicUrlValidation> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Please enter a valid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are supported." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "URLs with embedded credentials are not allowed." };
  }

  const hostname = stripIpv6Brackets(url.hostname.toLowerCase());
  if (!hostname) {
    return { ok: false, error: "The URL hostname is empty." };
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { ok: false, error: "Private, local, or reserved network URLs are not allowed." };
  }

  let addresses: ResolvedAddress[];
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily as 4 | 6 }];
  } else {
    try {
      addresses = await (options.resolver ?? resolveAll)(hostname);
    } catch {
      return { ok: false, error: "Unable to resolve the URL host." };
    }
  }

  if (addresses.length === 0) {
    return { ok: false, error: "Unable to resolve the URL host." };
  }
  if (addresses.some(({ address }) => !isPublicIpAddress(address))) {
    return { ok: false, error: "The URL resolves to a private, local, or reserved network address." };
  }

  return { ok: true, url, addresses };
}

export function isPublicIpAddress(rawAddress: string) {
  const address = stripIpv6Brackets(rawAddress.toLowerCase().split("%")[0]);
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4ToNumber(address);
    return value !== null && !IPV4_BLOCKED_RANGES.some(([network, prefix]) => inIpv4Cidr(value, network, prefix));
  }
  if (family !== 6) {
    return false;
  }

  const bytes = ipv6ToBytes(address);
  if (!bytes) {
    return false;
  }

  const mappedIpv4 = embeddedIpv4(bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff]);
  if (mappedIpv4 !== null) {
    return isPublicIpAddress(numberToIpv4(mappedIpv4));
  }

  // NAT64 well-known prefix. Public embedded addresses are acceptable; private
  // and reserved addresses remain blocked after translation.
  const nat64Ipv4 = embeddedIpv4(bytes, [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0]);
  if (nat64Ipv4 !== null) {
    return isPublicIpAddress(numberToIpv4(nat64Ipv4));
  }

  // 6to4 embeds an IPv4 address immediately after 2002::/16.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    const value = ((bytes[2] << 24) | (bytes[3] << 16) | (bytes[4] << 8) | bytes[5]) >>> 0;
    return isPublicIpAddress(numberToIpv4(value));
  }

  // Only global-unicast space is accepted. This rejects unspecified,
  // loopback, ULA, link-local, multicast and deprecated site-local ranges.
  if ((bytes[0] & 0xe0) !== 0x20) {
    return false;
  }

  // 2001::/23 is only partially allocated. Permit its explicitly globally
  // reachable endpoint allocations instead of treating the entire IANA block
  // as public. ORCHIDv2 is intentionally omitted because it is an identifier
  // space rather than a conventional unicast endpoint.
  const globallyReachableIanaProtocolAssignment =
    inIpv6Cidr(bytes, "2001:1::1", 128) || // PCP anycast
    inIpv6Cidr(bytes, "2001:1::2", 128) || // TURN anycast
    inIpv6Cidr(bytes, "2001:1::3", 128) || // DNS-SD registration anycast
    inIpv6Cidr(bytes, "2001:3::", 32) || // AMT
    inIpv6Cidr(bytes, "2001:4:112::", 48) || // AS112-v6
    inIpv6Cidr(bytes, "2001:30::", 28); // Drone Remote ID DETs
  if (inIpv6Cidr(bytes, "2001::", 23) && !globallyReachableIanaProtocolAssignment) {
    return false;
  }

  // Other special-purpose ranges that are not globally routable endpoints.
  if (
    inIpv6Cidr(bytes, "2001:db8::", 32) || // documentation
    inIpv6Cidr(bytes, "3fff::", 20) // documentation
  ) {
    return false;
  }

  return IPV6_ALLOCATED_RANGES.some(([network, prefix]) => inIpv6Cidr(bytes, network, prefix));
}

async function resolveAll(hostname: string): Promise<ResolvedAddress[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses
    .filter((entry): entry is { address: string; family: 4 | 6 } => entry.family === 4 || entry.family === 6)
    .map(({ address, family }) => ({ address, family }));
}

function ipv4ToNumber(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function inIpv4Cidr(value: number, network: number, prefix: number) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
}

function inIpv6Cidr(value: number[], rawNetwork: string, prefix: number) {
  const network = ipv6ToBytes(rawNetwork);
  if (!network) return false;

  const wholeBytes = Math.floor(prefix / 8);
  for (let index = 0; index < wholeBytes; index += 1) {
    if (value[index] !== network[index]) return false;
  }

  const remainingBits = prefix % 8;
  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (value[wholeBytes] & mask) === (network[wholeBytes] & mask);
}

function numberToIpv4(value: number) {
  return [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join(".");
}

function ipv6ToBytes(address: string) {
  const halves = address.split("::");
  if (halves.length > 2) return null;

  const parseSide = (side: string) => {
    if (!side) return [] as number[];
    const words: number[] = [];
    for (const part of side.split(":")) {
      if (part.includes(".")) {
        const ipv4 = ipv4ToNumber(part);
        if (ipv4 === null) return null;
        words.push((ipv4 >>> 16) & 0xffff, ipv4 & 0xffff);
      } else if (/^[0-9a-f]{1,4}$/i.test(part)) {
        words.push(Number.parseInt(part, 16));
      } else {
        return null;
      }
    }
    return words;
  };

  const left = parseSide(halves[0]);
  const right = parseSide(halves[1] ?? "");
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const words = [...left, ...Array.from({ length: missing }, () => 0), ...right];
  if (words.length !== 8) return null;
  return words.flatMap((word) => [word >>> 8, word & 0xff]);
}

function embeddedIpv4(bytes: number[], prefix: number[]) {
  if (prefix.length !== 12 || prefix.some((value, index) => bytes[index] !== value)) {
    return null;
  }
  return ((bytes[12] << 24) | (bytes[13] << 16) | (bytes[14] << 8) | bytes[15]) >>> 0;
}

function stripIpv6Brackets(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}
