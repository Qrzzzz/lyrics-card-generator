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
import { isPublicIpAddress, type PublicUrlResolver } from "../lib/url-safety";

const publicAddress = { address: "93.184.216.34", family: 4 as const };
const publicResolver: PublicUrlResolver = async () => [publicAddress];

function response(status: number, headers: Record<string, string> = {}, body = "") {
  return {
    status,
    headers: new Headers(headers),
    body: new TextEncoder().encode(body)
  };
}

async function expectCode(promise: Promise<unknown>, code: SafeFetchError["code"]) {
  await assert.rejects(promise, (error: unknown) => error instanceof SafeFetchError && error.code === code);
}

async function main() {
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
