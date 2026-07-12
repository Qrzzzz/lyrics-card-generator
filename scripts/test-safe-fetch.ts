import assert from "node:assert/strict";
import { safeFetch, SafeFetchError, type SafeFetchTransport } from "../lib/safe-fetch";
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
  "2001:db8::1",
  "::ffff:127.0.0.1",
  "64:ff9b::a9fe:a9fe",
  "2002:7f00:0001::"
]) {
  assert.equal(isPublicIpAddress(address), false, `${address} must be blocked`);
}
assert.equal(isPublicIpAddress("2606:4700:4700::1111"), true);

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

console.log("safe-fetch security tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
