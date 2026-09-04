import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  nodeTransport,
  safeFetch,
  SafeFetchError,
  type SafeFetchTransport,
  type SafeFetchTransportRequest
} from "../lib/safe-fetch";
import { detectSource, resolveRedirect } from "../lib/song-parser";
import { isPublicIpAddress, type PublicUrlResolver } from "../lib/url-safety";

const publicAddress = { address: "93.184.216.34", family: 4 as const };
// Use a deterministic public answer so tests cover validation and connection
// pinning without relying on live DNS.
const publicResolver: PublicUrlResolver = async () => [publicAddress];

function response(status: number, headers: Record<string, string> = {}, body: string | Uint8Array = "") {
  return {
    status,
    headers: new Headers(headers),
    body: typeof body === "string" ? new TextEncoder().encode(body) : body
  };
}

async function expectCode(promise: Promise<unknown>, code: SafeFetchError["code"]) {
  await assert.rejects(promise, (error: unknown) => error instanceof SafeFetchError && error.code === code);
}

async function main() {
// Reserved, documentation, transition, and IPv4-mapped ranges all remain
// blocked even when their textual representation looks globally routable.
assert.equal(isPublicIpAddress("8.8.8.8"), true);
for (const address of [
  "127.0.0.1",
  "10.0.0.1",
  "169.254.169.254",
  "192.0.2.10",
  "198.18.0.1",
  "224.0.0.1",
  "::1",
  "fe80::1",
  "fc00::1",
  "2001:100::1",
  "2001:db8::1",
  "2001:20::1",
  "2d00::1",
  "3000::1",
  "::ffff:127.0.0.1",
  "64:ff9b::a9fe:a9fe",
  "2002:7f00:0001::"
]) {
  assert.equal(isPublicIpAddress(address), false, `${address} must be blocked`);
}
for (const address of [
  "2001:200::1",
  "2001:1200::1",
  "2001:1800::1",
  "2001:3::1",
  "2606:4700:4700::1111",
  "::ffff:8.8.8.8",
  "64:ff9b::808:808",
  "2002:0808:0808::"
]) {
  assert.equal(isPublicIpAddress(address), true, `${address} must remain public`);
}

for (const target of [
  "http://127.0.0.1/admin",
  "http://169.254.169.254/latest/meta-data",
  "http://[::1]/admin",
  "http://[::ffff:127.0.0.1]/admin"
]) {
  const visited: string[] = [];
  const transport: SafeFetchTransport = async ({ url }) => {
    visited.push(url.toString());
    return response(302, { location: target });
  };
  await expectCode(safeFetch("https://public.example/start", { resolver: publicResolver, transport }), "UNSAFE_URL");
  assert.deepEqual(visited, ["https://public.example/start"], `${target} must receive zero requests`);
}

{
  const visited: string[] = [];
  const transport: SafeFetchTransport = async ({ url, address }) => {
    visited.push(`${url.pathname}@${address.address}`);
    if (url.pathname === "/start") return response(307, { location: "/middle" });
    if (url.pathname === "/middle") return response(302, { location: "https://cdn.example/final" });
    return response(200, { "content-type": "text/plain" }, "ok");
  };
  const result = await safeFetch("https://public.example/start", {
    resolver: publicResolver,
    transport,
    allowedContentTypes: ["text/plain"]
  });
  assert.equal(result.text(), "ok");
  assert.equal(result.url, "https://cdn.example/final");
  assert.deepEqual(visited, [
    "/start@93.184.216.34",
    "/middle@93.184.216.34",
    "/final@93.184.216.34"
  ]);
}

{
  const attempts: string[] = [];
  const resolver: PublicUrlResolver = async () => [
    { address: "2606:4700:4700::1111", family: 6 },
    { address: "2606:4700:4700::1001", family: 6 },
    { address: "8.8.8.8", family: 4 },
    { address: "1.1.1.1", family: 4 }
  ];
  const transport: SafeFetchTransport = async ({ address }) => {
    attempts.push(address.address);
    if (address.family === 6) throw new Error("IPv6 route unavailable");
    return response(200, { "content-type": "text/plain" }, "fallback ok");
  };
  const result = await safeFetch("https://dual-stack.example/card", {
    resolver,
    transport,
    allowedContentTypes: ["text/plain"]
  });
  assert.equal(result.text(), "fallback ok");
  assert.deepEqual(
    attempts,
    ["2606:4700:4700::1111", "8.8.8.8"],
    "validated IPv6 and IPv4 candidates are interleaved so IPv4 can immediately recover"
  );
}

// A silent preferred route must leave time for the other validated family.
for (const firstFamily of [6, 4] as const) {
  const candidates = [
    { address: "2606:4700:4700::1111", family: 6 as const },
    { address: "8.8.8.8", family: 4 as const }
  ].sort((a) => a.family === firstFamily ? -1 : 1);
  const attempts: number[] = [];
  const signals: AbortSignal[] = [];
  const result = await safeFetch("https://silent-route.example/card", {
    resolver: async () => candidates,
    timeoutMs: 200,
    transport: async ({ address, signal }) => {
      attempts.push(address.family);
      signals.push(signal);
      if (address.family === firstFamily) return new Promise(() => {});
      assert.ok(signals[0].aborted, "the silent candidate is closed before its replacement starts");
      return response(200, { "content-type": "text/plain" }, "healthy backup");
    }
  });
  assert.equal(result.text(), "healthy backup");
  assert.deepEqual(attempts, candidates.map(({ family }) => family));
  assert.ok(signals.every((signal) => signal.aborted), "settled attempts release their transport");
}

{
  const signals: AbortSignal[] = [];
  const start = performance.now();
  await expectCode(safeFetch("https://all-silent.example/card", {
    resolver: async () => [publicAddress, { address: "8.8.8.8", family: 4 }],
    timeoutMs: 150,
    transport: async ({ signal }) => { signals.push(signal); return new Promise(() => {}); }
  }), "TIMEOUT");
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.ok(performance.now() - start < 700, "fallbacks share one deadline");
}

{
  const caller = new AbortController();
  const signals: AbortSignal[] = [];
  await expectCode(safeFetch("https://cancel-silent.example/card", {
    resolver: async () => [publicAddress, { address: "8.8.8.8", family: 4 }],
    signal: caller.signal,
    timeoutMs: 500,
    transport: async ({ signal }) => {
      signals.push(signal);
      caller.abort();
      return new Promise(() => {});
    }
  }), "NETWORK");
  assert.equal(signals.length, 1, "caller cancellation never starts a fallback");
  assert.ok(signals[0].aborted);
}

await assertNativeCandidateBudgets();

{
  let transportCount = 0;
  const resolver: PublicUrlResolver = async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "127.0.0.1", family: 4 }
  ];
  await expectCode(safeFetch("https://mixed-addresses.example/card", {
    resolver,
    transport: async () => {
      transportCount += 1;
      return response(200);
    }
  }), "UNSAFE_URL");
  assert.equal(transportCount, 0, "one unsafe DNS candidate blocks the complete hop before networking");
}

{
  const candidates = [
    { address: "8.8.8.8", family: 4 as const },
    { address: "1.1.1.1", family: 4 as const }
  ];
  const error = await safeFetch("https://all-fail.example/card", {
    resolver: async () => candidates,
    transport: async ({ address }) => {
      throw new Error(`connect ${address.address} refused`);
    }
  }).then(
    () => undefined,
    (reason: unknown) => reason
  );
  assert.ok(error instanceof SafeFetchError);
  assert.equal(error.code, "ALL_ADDRESSES_FAILED");
  assert.deepEqual(error.candidateFailures.map(({ address }) => address), ["8.8.8.8", "1.1.1.1"]);
  assert.match(error.message, /8\.8\.8\.8.*1\.1\.1\.1/);
}

{
  let resolveCount = 0;
  const visited: string[] = [];
  const resolver: PublicUrlResolver = async () => {
    resolveCount += 1;
    return resolveCount === 1
      ? [{ address: "8.8.8.8", family: 4 }]
      : [{ address: "1.1.1.1", family: 4 }];
  };
  const transport: SafeFetchTransport = async ({ url, address }) => {
    visited.push(`${url.pathname}@${address.address}`);
    return url.pathname === "/start"
      ? response(302, { location: "/final" })
      : response(200, { "content-type": "text/plain" }, "redirect ok");
  };
  const result = await safeFetch("https://redirect-reresolve.example/start", { resolver, transport });
  assert.equal(result.text(), "redirect ok");
  assert.deepEqual(visited, ["/start@8.8.8.8", "/final@1.1.1.1"]);
  assert.equal(resolveCount, 2, "redirects must not reuse the previous hop's validated address");
}

{
  const fixtures = [
    {
      start: "https://spotify.link/card",
      middle: "https://spotify.link/r/song",
      final: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
      source: "spotify"
    },
    {
      start: "https://163cn.tv/song",
      middle: "https://163cn.tv/r/song",
      final: "https://music.163.com/song?id=186016",
      source: "netease"
    },
    {
      start: "https://u.y.qq.com/card",
      middle: "https://u.y.qq.com/r/song",
      final: "https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV",
      source: "qq"
    }
  ] as const;

  for (const fixture of fixtures) {
    const visited: string[] = [];
    const transport: SafeFetchTransport = async ({ url }) => {
      visited.push(url.toString());
      if (url.toString() === fixture.start) return response(302, { location: "/r/song" });
      if (url.toString() === fixture.middle) return response(307, { location: fixture.final });
      return response(200, { "content-type": "text/html" });
    };
    const finalUrl = await resolveRedirect(fixture.start, { resolver: publicResolver, transport });
    assert.equal(finalUrl, fixture.final);
    assert.equal(detectSource(fixture.start), fixture.source, `${fixture.start} shortlink platform`);
    assert.equal(detectSource(finalUrl), fixture.source, `${fixture.final} final platform`);
    assert.deepEqual(visited, [fixture.start, fixture.middle, fixture.final]);
  }
}

{
  const expectedBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03]);
  const visited: string[] = [];
  const transport: SafeFetchTransport = async ({ url }) => {
    visited.push(url.toString());
    if (url.toString() === "https://i.scdn.co/image/cover") {
      return response(302, { location: "/image/cover-middle" });
    }
    if (url.toString() === "https://i.scdn.co/image/cover-middle") {
      return response(307, { location: "https://p.scdn.co/image/cover-final" });
    }
    return response(200, { "content-type": "image/jpeg" }, expectedBytes);
  };
  const cover = await safeFetch("https://i.scdn.co/image/cover", {
    resolver: publicResolver,
    transport,
    allowedContentTypes: ["image/"],
    maxResponseBytes: 32
  });
  assert.equal(cover.url, "https://p.scdn.co/image/cover-final");
  assert.equal(cover.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(cover.body, expectedBytes);
  assert.deepEqual(visited, [
    "https://i.scdn.co/image/cover",
    "https://i.scdn.co/image/cover-middle",
    "https://p.scdn.co/image/cover-final"
  ]);
}

{
  const visited: string[] = [];
  const transport: SafeFetchTransport = async ({ url }) => {
    visited.push(url.toString());
    return response(302, { location: "http://169.254.169.254/latest/meta-data" });
  };
  await expectCode(resolveRedirect("https://spotify.link/private", {
    resolver: publicResolver,
    transport
  }), "UNSAFE_URL");
  assert.deepEqual(visited, ["https://spotify.link/private"], "platform shortlink private target receives zero requests");
}

{
  let resolveCount = 0;
  let transportCount = 0;
  const resolver: PublicUrlResolver = async () => {
    resolveCount += 1;
    return resolveCount === 1 ? [publicAddress] : [{ address: "127.0.0.1", family: 4 }];
  };
  const transport: SafeFetchTransport = async () => {
    transportCount += 1;
    return response(302, { location: "/again" });
  };
  await expectCode(safeFetch("https://rebind.example/start", { resolver, transport }), "UNSAFE_URL");
  assert.equal(resolveCount, 2, "the hostname must be resolved again before the redirect hop");
  assert.equal(transportCount, 1, "the rebound private target must receive zero requests");
}

{
  const transport: SafeFetchTransport = async () => response(302, { location: "/loop" });
  await expectCode(safeFetch("https://public.example/loop", {
    resolver: publicResolver,
    transport,
    maxRedirects: 2
  }), "TOO_MANY_REDIRECTS");
}

{
  const largeTransport: SafeFetchTransport = async () => response(200, { "content-type": "text/plain" }, "12345");
  await expectCode(safeFetch("https://public.example/body", {
    resolver: publicResolver,
    transport: largeTransport,
    maxResponseBytes: 4
  }), "BODY_TOO_LARGE");

  const htmlTransport: SafeFetchTransport = async () => response(200, { "content-type": "text/html" }, "ok");
  await expectCode(safeFetch("https://public.example/type", {
    resolver: publicResolver,
    transport: htmlTransport,
    allowedContentTypes: ["image/"]
  }), "CONTENT_TYPE");
}

{
  const transport: SafeFetchTransport = ({ signal }) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  await expectCode(safeFetch("https://public.example/slow", {
    resolver: publicResolver,
    transport,
    timeoutMs: 10
  }), "TIMEOUT");
}

{
  const startedAt = Date.now();
  const resolver: PublicUrlResolver = async () => new Promise(() => undefined);
  await withTestDeadline(
    expectCode(safeFetch("https://resolver-hangs.example/slow", {
      resolver,
      timeoutMs: 20
    }), "TIMEOUT"),
    500,
    "the resolver deadline did not settle"
  );
  assert.ok(Date.now() - startedAt < 500, "the hard deadline must cover a resolver that ignores cancellation");
}

{
  const startedAt = Date.now();
  const transport: SafeFetchTransport = async () => new Promise(() => undefined);
  await withTestDeadline(
    expectCode(safeFetch("https://transport-hangs.example/slow", {
      resolver: publicResolver,
      transport,
      timeoutMs: 20
    }), "TIMEOUT"),
    500,
    "the transport deadline did not settle"
  );
  assert.ok(Date.now() - startedAt < 500, "the hard deadline must cover a transport that ignores cancellation");
}

await assertBodylessNativeTransportCloses("redirect", 302, "GET", false);
await assertBodylessNativeTransportCloses("head", 200, "HEAD", false);
await assertBodylessNativeTransportCloses("discard", 200, "GET", true);

console.log("safe-fetch security tests passed");
}

async function assertNativeCandidateBudgets() {
  let mode: "silent" | "slow-body" = "silent";
  let firstFamily = 6;
  const closed: number[] = [];
  const timers = new Set<NodeJS.Timeout>();
  const server = createServer((request, outgoing) => {
    assert.match(request.headers.host ?? "", /^native-budget\.example:/);
    const family = request.socket.remoteAddress === "::1" ? 6 : 4;
    outgoing.on("close", () => closed.push(family));
    if (mode === "silent" && family === firstFamily) return;
    outgoing.writeHead(200, { "content-type": "text/plain" });
    outgoing.flushHeaders();
    if (mode === "slow-body") {
      const timer = setTimeout(() => { outgoing.end("slow body completed"); timers.delete(timer); }, 240);
      timers.add(timer);
    } else outgoing.end("native backup");
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "::", resolve); });
  try {
    const port = (server.address() as AddressInfo).port;
    for (firstFamily of [6, 4]) {
      const attempts: number[] = [];
      const candidates = [
        { address: "2606:4700:4700::1111", family: 6 as const },
        { address: "8.8.8.8", family: 4 as const }
      ].sort((a) => a.family === firstFamily ? -1 : 1);
      for (mode of ["silent", "slow-body"] as const) {
        attempts.length = 0;
        closed.length = 0;
        const result = await safeFetch(`http://native-budget.example:${port}/card`, {
          resolver: async () => candidates,
          timeoutMs: 400,
          transport: (request) => {
            assert.ok(candidates.some((candidate) => candidate.address === request.address.address));
            attempts.push(request.address.family);
            // Only the physical socket is mapped into this isolated loopback fixture.
            return nodeTransport({ ...request, address: {
              address: request.address.family === 6 ? "::1" : "127.0.0.1",
              family: request.address.family
            } });
          }
        });
        assert.equal(result.text(), mode === "silent" ? "native backup" : "slow body completed");
        assert.deepEqual(attempts, mode === "silent" ? candidates.map(({ family }) => family) : [firstFamily]);
        if (mode === "silent") assert.ok(closed.includes(firstFamily), "silent socket was destroyed");
      }
    }
  } finally {
    timers.forEach(clearTimeout);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function assertBodylessNativeTransportCloses(
  label: string,
  status: number,
  method: "GET" | "HEAD",
  discardResponseBody: boolean
) {
  let resolveClosed: () => void = () => undefined;
  const responseClosed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const intervals = new Set<NodeJS.Timeout>();
  const server = createServer((_request, response) => {
    response.writeHead(status, status === 302 ? { location: "/next" } : { "content-type": "text/plain" });
    response.flushHeaders();
    const interval = setInterval(() => response.write(Buffer.alloc(1024)), 2);
    intervals.add(interval);
    response.on("close", () => {
      clearInterval(interval);
      intervals.delete(interval);
      resolveClosed();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const port = (server.address() as AddressInfo).port;
    const controller = new AbortController();
    const request: SafeFetchTransportRequest = {
      url: new URL(`http://public.example:${port}/${label}`),
      address: { address: "127.0.0.1", family: 4 },
      method,
      headers: new Headers(),
      signal: controller.signal,
      maxResponseBytes: 1,
      allowedContentTypes: [],
      discardResponseBody
    };
    const result = await nodeTransport(request);
    assert.equal(result.status, status);
    assert.equal(result.body.byteLength, 0);
    await withTestDeadline(
      responseClosed,
      500,
      `${label} response was drained instead of closed`
    );
  } finally {
    intervals.forEach(clearInterval);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function withTestDeadline<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
