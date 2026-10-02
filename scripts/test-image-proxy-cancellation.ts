import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { proxyImage } from "../lib/image-proxy";
import { GET } from "../app/api/image-proxy/route";
import { safeFetch, nodeTransport } from "../lib/safe-fetch";

const request = (signal: AbortSignal) => new Request("http://localhost/api/image-proxy?url=https%3A%2F%2Fpublic.example%2Fcover.png", { signal });
const addresses = [{ address: "8.8.8.8", family: 4 as const }];

async function main() {
  const pre = new AbortController();
  pre.abort();
  assert.equal((await GET(request(pre.signal))).status, 499, "route propagates pre-cancellation before DNS");
  for (const stage of ["dns", "headers"] as const) {
    const caller = new AbortController();
    let reached: () => void = () => {};
    const ready = new Promise<void>((resolve) => { reached = resolve; });
    let transportSignal: AbortSignal | undefined;
    const result = proxyImage(request(caller.signal), (url, options) => {
      assert.equal(options?.signal?.aborted, false);
      return safeFetch(url, { ...options,
        resolver: async () => { if (stage === "dns") { reached(); return new Promise(() => {}); } return addresses; },
        transport: async ({ signal }) => { transportSignal = signal; reached(); return new Promise(() => {}); }
      });
    });
    await ready;
    caller.abort();
    assert.equal((await result).status, 499);
    if (stage === "headers") assert.equal(transportSignal?.aborted, true);
  }
  let bytesSent = 0;
  let started: () => void = () => {};
  const bodyStarted = new Promise<void>((resolve) => { started = resolve; });
  let closed: () => void = () => {};
  const bodyClosed = new Promise<void>((resolve) => { closed = resolve; });
  const server = createServer((_incoming, outgoing) => {
    outgoing.writeHead(200, { "content-type": "image/png" });
    outgoing.write(Buffer.alloc(1024));
    bytesSent += 1024;
    started();
    const interval = setInterval(() => { outgoing.write(Buffer.alloc(1024)); bytesSent += 1024; }, 10);
    outgoing.on("close", () => { clearInterval(interval); closed(); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const caller = new AbortController();
    const port = (server.address() as AddressInfo).port;
    const result = proxyImage(request(caller.signal), (_url, options) => safeFetch(`http://public.example:${port}/cover.png`, {
      ...options, resolver: async () => addresses,
      transport: (transportRequest) => nodeTransport({ ...transportRequest, address: { address: "127.0.0.1", family: 4 } })
    }));
    await bodyStarted;
    caller.abort();
    assert.equal((await result).status, 499);
    await bodyClosed;
    assert.ok(bytesSent < 8 * 1024 * 1024, "cancelled body stops before the response budget");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const normal = await proxyImage(request(new AbortController().signal), (url, options) => safeFetch(url, {
    ...options, resolver: async () => addresses,
    transport: async () => ({ status: 200, headers: new Headers({ "content-type": "image/png" }), body: Buffer.from("image") })
  }));
  assert.equal(normal.status, 200);
  assert.equal(await normal.text(), "image");
  console.log("Image proxy cancellation passed at pre-request, DNS, headers and native body stages.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
