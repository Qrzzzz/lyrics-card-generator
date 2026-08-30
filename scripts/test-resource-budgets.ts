import assert from "node:assert/strict";
import { createServer, type RequestListener, type Server } from "node:http";
import { once } from "node:events";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { POST as parseSong } from "../app/api/parse-song/route";
import { POST as fetchLyrics } from "../app/api/fetch-lyrics/route";
import { POST as searchSong } from "../app/api/search-song/route";
import { POST as resolveSong } from "../app/api/resolve-searched-song/route";
import { POST as translate } from "../app/api/ai/translate/route";
import { POST as parseLocalAudio } from "../app/api/parse-local-audio/route";
import { checkGitHubUpdate } from "../lib/github-update";
import { readLimitedJson } from "../lib/json-request";
import {
  readResponseJsonBounded,
  readResponseTextBounded,
  ResponseBodyLimitExceededError
} from "../lib/bounded-response";
import {
  ClientRequestCancelledError,
  UpstreamTimeoutError,
  withUpstreamDeadline
} from "../lib/upstream-control";
import {
  createLocalAudioMetadataObserver,
  limitLocalAudioMetadataTokenizer,
  LocalAudioMetadataLimitExceededError
} from "../lib/local-audio-metadata-budget";
import {
  MAX_LOCAL_AUDIO_EMBEDDED_COVER_BYTES,
  MAX_LOCAL_AUDIO_ALBUM_CHARACTERS,
  MAX_LOCAL_AUDIO_ARTIST_CHARACTERS,
  MAX_LOCAL_AUDIO_TITLE_CHARACTERS
} from "../lib/local-audio-limits";
import {
  AIStreamError,
  assertAICompletionBudgets,
  consumeOpenAICompatibleSSE,
  resourceBudgets
} from "../electron/ai-stream";
import { readProviderResponseBody } from "../lib/ai/provider-response";
import { APP_REQUEST_HEADER_NAME, APP_REQUEST_HEADER_VALUE } from "../lib/app-request";

const APP_ORIGIN = "http://127.0.0.1:3000";
process.env.LYRICS_CARD_APP_ORIGIN = APP_ORIGIN;
process.env.LYRICS_CARD_TRUST_PROXY = "0";

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  console.log("[resource-budget-test] json routes");
  await assertJsonRouteRequestBudgets();
  console.log("[resource-budget-test] decoded responses");
  await assertBoundedDecodedResponses();
  console.log("[resource-budget-test] control classification");
  await assertUpstreamControlClassification();
  console.log("[resource-budget-test] direct upstreams");
  await assertDirectUpstreamBudgetsAndCancellation();
  console.log("[resource-budget-test] SSE");
  await assertAIStreamBudgets();
  console.log("[resource-budget-test] provider bodies");
  await assertProviderBodyBudgets();
  console.log("[resource-budget-test] local audio");
  await assertLocalAudioMetadataBudgets();
  assertDesktopWiring();

  console.log("Resource budget tests passed.");
  console.log(JSON.stringify(resourceBudgets));
}

async function assertJsonRouteRequestBudgets() {
  const routes = [
    ["/api/parse-song", resourceBudgets.jsonRequestBytes.parseSong, parseSong, false],
    ["/api/fetch-lyrics", resourceBudgets.jsonRequestBytes.fetchLyrics, fetchLyrics, false],
    ["/api/search-song", resourceBudgets.jsonRequestBytes.searchSong, searchSong, false],
    ["/api/resolve-searched-song", resourceBudgets.jsonRequestBytes.resolveSearchedSong, resolveSong, false],
    ["/api/ai/translate", resourceBudgets.jsonRequestBytes.aiTranslate, translate, true]
  ] as const;

  for (const [path, limit, route, nestedError] of routes) {
    const fixture = countingJsonRequest(path, new Uint8Array(limit + 17), { chunkSize: 4096 });
    assert.equal(fixture.request.headers.has("content-length"), false, `${path} fixture is chunked/lengthless`);
    const response = await route(fixture.request);
    assert.equal(response.status, 413, `${path} rejects an oversized encoded body`);
    const payload = await response.json() as { code?: string; error?: { code?: string } };
    assert.equal(
      nestedError ? payload.error?.code : payload.code,
      nestedError ? "request_too_large" : "request_body_too_large",
      `${path} returns its stable size code`
    );
    assert.equal(fixture.stats.cancelled, true, `${path} cancels its request body on overflow`);
    assert.ok(fixture.stats.pulledBytes <= limit + 4096, `${path} reads at most one source chunk past the limit`);
  }

  const deceptive = countingJsonRequest("/api/test", new TextEncoder().encode('"oversized"'), {
    chunkSize: 2,
    contentLength: "1"
  });
  const deceptiveResult = await readLimitedJson(deceptive.request, 4);
  assert.deepEqual(deceptiveResult.ok, false);
  if (deceptiveResult.ok) assert.fail("deceptive JSON body unexpectedly passed");
  assert.equal(deceptiveResult.reason, "too_large");
  assert.equal(deceptive.stats.cancelled, true);

  const declared = countingJsonRequest("/api/test", new Uint8Array([123, 125]), {
    contentLength: "999999999999999999999999"
  });
  const declaredResult = await readLimitedJson(declared.request, 16);
  assert.equal(declaredResult.ok, false);
  assert.equal(declared.stats.pulledBytes, 0, "oversized declarations are rejected before a pull");
  assert.equal(declared.stats.cancelled, true);

  const multibyte = new TextEncoder().encode(JSON.stringify({ value: "边界🙂" }));
  const legal = countingJsonRequest("/api/test", multibyte, { chunkSize: 1 });
  const legalResult = await readLimitedJson<{ value: string }>(legal.request, multibyte.byteLength);
  assert.equal(legalResult.ok, true);
  if (legalResult.ok) assert.equal(legalResult.value.value, "边界🙂");
}

async function assertBoundedDecodedResponses() {
  const decodedPayload = Buffer.from(JSON.stringify({ value: "x".repeat(4096) }));
  const compressed = gzipSync(decodedPayload);
  assert.ok(compressed.byteLength < 1024, "gzip fixture is smaller than the decoded response budget");

  await withLocalServer((request, response) => {
    if (request.url === "/gzip") {
      response.writeHead(200, {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": compressed.byteLength
      });
      response.end(compressed);
      return;
    }
    response.writeHead(404).end();
  }, async (origin) => {
    const response = await fetch(`${origin}/gzip`);
    await assert.rejects(
      readResponseJsonBounded(response, 1024),
      ResponseBodyLimitExceededError,
      "the post-decompression bytes, not the small wire Content-Length, own the limit"
    );
  });

  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(7));
      controller.enqueue(new Uint8Array(7));
    },
    cancel() {
      cancelled = true;
    }
  }, { highWaterMark: 0 }));
  await assert.rejects(readResponseTextBounded(response, 10), ResponseBodyLimitExceededError);
  assert.equal(cancelled, true, "bounded response overflow cancels the source stream");
}

async function assertUpstreamControlClassification() {
  const startedAt = Date.now();
  await assert.rejects(
    withUpstreamDeadline(undefined, 10, async () => await new Promise<never>(() => {})),
    UpstreamTimeoutError
  );
  assert.ok(Date.now() - startedAt < 500, "the deadline wins even when an upstream ignores abort");

  const controller = new AbortController();
  const cancelled = withUpstreamDeadline(controller.signal, 1000, (signal) => waitForAbort(signal));
  controller.abort(new Error("fixture client disconnected"));
  await assert.rejects(cancelled, ClientRequestCancelledError);
}

async function assertDirectUpstreamBudgetsAndCancellation() {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => oversizedStreamedJsonResponse(
      resourceBudgets.upstreamResponseBytes.lrclibSearch
    );
    const lyricsResponse = await fetchLyrics(jsonRequest("/api/fetch-lyrics", {
      source: "unknown",
      title: "fixture",
      artist: ""
    }));
    assert.equal(lyricsResponse.status, 502);
    assert.equal((await lyricsResponse.json() as { code: string }).code, "upstream_response_too_large");

    globalThis.fetch = async () => oversizedStreamedJsonResponse(
      resourceBudgets.upstreamResponseBytes.neteaseSearch
    );
    const searchResponse = await searchSong(jsonRequest("/api/search-song", { keyword: "fixture" }));
    assert.equal(searchResponse.status, 502);
    assert.equal((await searchResponse.json() as { code: string }).code, "upstream_response_too_large");

    globalThis.fetch = async () => oversizedStreamedJsonResponse(
      resourceBudgets.upstreamResponseBytes.neteaseDetail
    );
    const detailResponse = await resolveSong(jsonRequest(
      "/api/resolve-searched-song",
      { source: "netease", id: "1" }
    ));
    assert.equal(detailResponse.status, 502);
    assert.equal((await detailResponse.json() as { code: string }).code, "upstream_response_too_large");

    let resolveFetches = 0;
    globalThis.fetch = async () => {
      resolveFetches += 1;
      if (resolveFetches === 1) {
        return new Response(JSON.stringify({
          songs: [{ name: "fixture", artists: [{ name: "artist" }], album: { name: "album" } }]
        }), { headers: { "content-type": "application/json" } });
      }
      return oversizedStreamedJsonResponse(resourceBudgets.upstreamResponseBytes.neteaseLyrics);
    };
    const lyricResponse = await resolveSong(jsonRequest(
      "/api/resolve-searched-song",
      { source: "netease", id: "1" }
    ));
    assert.equal(lyricResponse.status, 502);
    assert.equal((await lyricResponse.json() as { code: string }).code, "upstream_response_too_large");
    assert.equal(resolveFetches, 2, "the oversized lyric fixture is reached after bounded detail parsing");

    globalThis.fetch = async () => oversizedStreamedJsonResponse(
      resourceBudgets.upstreamResponseBytes.githubRelease
    );
    const update = await checkGitHubUpdate("6.2.1");
    assert.equal(update.status, "error");
    if (update.status === "error") assert.equal(update.code, "response_too_large");

    globalThis.fetch = async () => oversizedStreamedJsonResponse(
      resourceBudgets.upstreamResponseBytes.aiProviderBody
    );
    const aiResponse = await translate(jsonRequest("/api/ai/translate", {
      prompt: "fixture",
      settings: {
        apiKey: "fixture-key",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "fixture-model"
      }
    }));
    assert.equal(aiResponse.status, 502);
    assert.equal((await aiResponse.json() as { error: { code: string } }).error.code, "response_too_large");

    let relayPulls = 0;
    let relayCancelled = false;
    const relayChunk = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n');
    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        relayPulls += 1;
        controller.enqueue(relayChunk);
      },
      cancel() {
        relayCancelled = true;
      }
    }, { highWaterMark: 0 }), { headers: { "content-type": "text/event-stream" } });
    const relayResponse = await translate(jsonRequest("/api/ai/translate", {
      prompt: "fixture",
      settings: {
        apiKey: "fixture-key",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "fixture-model"
      }
    }));
    assert.equal(relayResponse.status, 200);
    assert.equal(relayPulls, 0, "the browser relay does not pull ahead of its downstream consumer");
    const relayReader = relayResponse.body?.getReader();
    assert.ok(relayReader);
    const firstRelayRead = await relayReader.read();
    assert.deepEqual(firstRelayRead.value, relayChunk);
    assert.equal(relayPulls, 1, "one downstream read causes exactly one upstream pull");
    await relayReader.cancel(new Error("fixture browser cancellation"));
    assert.equal(relayCancelled, true, "browser response cancellation reaches the provider body");

    globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) {
        reject(init.signal.reason);
        return;
      }
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
    const requestController = new AbortController();
    const pendingSearch = searchSong(jsonRequest(
      "/api/search-song",
      { keyword: "fixture" },
      requestController.signal
    ));
    requestController.abort(new Error("fixture client disconnected"));
    const cancelledSearch = await pendingSearch;
    assert.equal(cancelledSearch.status, 499);
    assert.equal((await cancelledSearch.json() as { code: string }).code, "client_cancelled");

    const originalLrclibTimeout = resourceBudgets.upstreamTimeoutMs.lrclib;
    resourceBudgets.upstreamTimeoutMs.lrclib = 10;
    try {
      globalThis.fetch = async () => await new Promise<Response>(() => {});
      const timedOutLyrics = await fetchLyrics(jsonRequest("/api/fetch-lyrics", {
        source: "unknown",
        title: "fixture",
        artist: ""
      }));
      assert.equal(timedOutLyrics.status, 504);
      assert.equal((await timedOutLyrics.json() as { code: string }).code, "upstream_timeout");
    } finally {
      resourceBudgets.upstreamTimeoutMs.lrclib = originalLrclibTimeout;
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function assertAIStreamBudgets() {
  const text = "边界🙂";
  const encoded = new TextEncoder().encode(
    `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "思", content: text } }] })}\n\n`
      + "data: [DONE]\n\n"
  );
  const chunks = Array.from(encoded, (byte) => new Uint8Array([byte]));
  const normal = streamResponse(chunks);
  let accumulated = "";
  let reasoning = "";
  const result = await consumeOpenAICompatibleSSE(normal.response, {
    onDelta(_delta, value) { accumulated = value; },
    onReasoningDelta(_delta, value) { reasoning = value; }
  }, {
    limits: testStreamLimits({ bufferBytes: 1024, singleEventBytes: 512 })
  });
  assert.equal(result.content, text, "multi-byte code points survive one-byte network chunks");
  assert.equal(accumulated, text);
  assert.equal(reasoning, "思");
  assert.equal(result.doneReceived, true, "[DONE] completes without waiting for EOF");
  assert.equal(normal.stats.cancelled, true, "[DONE] cancels any unread provider tail");

  const giantEvent = streamResponse([
    new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "x".repeat(100) } }] })}\n\n`)
  ]);
  await assertStreamCode(
    consumeOpenAICompatibleSSE(giantEvent.response, {}, {
      limits: testStreamLimits({ singleEventBytes: 64, bufferBytes: 1024 })
    }),
    "stream_event_too_large"
  );

  await assertStreamCode(
    consumeOpenAICompatibleSSE(streamResponse([new Uint8Array(80)]).response, {}, {
      limits: testStreamLimits({ bufferBytes: 64, singleEventBytes: 64 })
    }),
    "stream_buffer_too_large"
  );

  const outputEvents = ["1234567890", "abcdefghij"].map((content) => (
    new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)
  ));
  await assertStreamCode(
    consumeOpenAICompatibleSSE(streamResponse(outputEvents).response, {}, {
      limits: testStreamLimits({ outputBytes: 15 })
    }),
    "stream_output_too_large"
  );

  const reasoningEvents = ["1234567890", "abcdefghij"].map((reasoning_content) => (
    new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content } }] })}\n\n`)
  ));
  await assertStreamCode(
    consumeOpenAICompatibleSSE(streamResponse(reasoningEvents).response, {}, {
      limits: testStreamLimits({ reasoningBytes: 15 })
    }),
    "stream_reasoning_too_large"
  );

  const idle = pendingStreamResponse();
  await assertStreamCode(
    consumeOpenAICompatibleSSE(idle.response, {}, {
      limits: testStreamLimits({ idleTimeoutMs: 10, totalDeadlineMs: 1000 })
    }),
    "stream_idle_timeout"
  );
  assert.equal(idle.stats.cancelled, true);

  const heartbeat = heartbeatStreamResponse(3);
  await assertStreamCode(
    consumeOpenAICompatibleSSE(heartbeat.response, {}, {
      deadlineAt: Date.now() + 18,
      limits: testStreamLimits({ idleTimeoutMs: 50, totalDeadlineMs: 18 })
    }),
    "stream_deadline_exceeded"
  );
  assert.equal(heartbeat.stats.cancelled, true);

  const userController = new AbortController();
  const infinite = heartbeatStreamResponse(3);
  const cancelled = consumeOpenAICompatibleSSE(infinite.response, {}, {
    signal: userController.signal,
    limits: testStreamLimits({ idleTimeoutMs: 100, totalDeadlineMs: 1000 })
  });
  setTimeout(() => userController.abort(new Error("fixture user cancellation")), 12);
  await assertStreamCode(cancelled, "cancelled");
  assert.equal(infinite.stats.cancelled, true);

  assert.throws(
    () => assertAICompletionBudgets("123456", "", testStreamLimits({ outputBytes: 5 })),
    (error: unknown) => error instanceof AIStreamError && error.code === "stream_output_too_large"
  );
}

async function assertProviderBodyBudgets() {
  const limit = resourceBudgets.upstreamResponseBytes.aiProviderBody;
  const declared = oversizedDeclaredJsonResponse(limit);
  await assert.rejects(readProviderResponseBody(declared), ResponseBodyLimitExceededError);

  const require = createRequire(import.meta.url);
  const electronProvider = require("../electron/provider-response.js") as {
    readProviderResponseBody(response: Response, signal?: AbortSignal): Promise<unknown>;
  };
  await assert.rejects(
    electronProvider.readProviderResponseBody(oversizedDeclaredJsonResponse(limit)),
    (error: unknown) => (error as { code?: string }).code === "response_too_large"
  );

  let electronBodyCancelled = false;
  const pendingElectronBody = new Response(new ReadableStream<Uint8Array>({
    pull() {},
    cancel() { electronBodyCancelled = true; }
  }, { highWaterMark: 0 }));
  const controller = new AbortController();
  const pendingRead = electronProvider.readProviderResponseBody(pendingElectronBody, controller.signal);
  controller.abort(new Error("fixture provider-body cancellation"));
  await assert.rejects(pendingRead, /fixture provider-body cancellation/);
  assert.equal(electronBodyCancelled, true, "Electron provider-body cancellation reaches the source stream");
}

async function assertLocalAudioMetadataBudgets() {
  let underlyingRead = false;
  const tokenizer = {
    readToken(token: { len: number }) {
      underlyingRead = true;
      return Promise.resolve(new Uint8Array(token.len));
    }
  };
  const limited = limitLocalAudioMetadataTokenizer(tokenizer, 64, 128);
  await assert.rejects(
    async () => limited.readToken({ len: 65 }),
    LocalAudioMetadataLimitExceededError,
    "the tokenizer rejects token.len before strtok3 can allocate it"
  );
  assert.equal(underlyingRead, false);

  const observer = createLocalAudioMetadataObserver();
  assert.throws(
    () => observer({
      tag: { type: "common", id: "title", value: "x".repeat(MAX_LOCAL_AUDIO_TITLE_CHARACTERS + 1) }
    }),
    LocalAudioMetadataLimitExceededError
  );
  const aggregateObserver = createLocalAudioMetadataObserver();
  aggregateObserver({
    tag: { type: "common", id: "artist", value: "x".repeat(700) }
  });
  assert.throws(
    () => aggregateObserver({
      tag: { type: "common", id: "artists", value: "x".repeat(400) }
    }),
    LocalAudioMetadataLimitExceededError,
    "repeated artist tags share one cumulative character budget"
  );
  assert.throws(
    () => observer({
      tag: { type: "common", id: "artist", value: "x".repeat(MAX_LOCAL_AUDIO_ARTIST_CHARACTERS + 1) }
    }),
    LocalAudioMetadataLimitExceededError
  );
  assert.throws(
    () => observer({
      tag: { type: "common", id: "album", value: "x".repeat(MAX_LOCAL_AUDIO_ALBUM_CHARACTERS + 1) }
    }),
    LocalAudioMetadataLimitExceededError
  );
  observer({
    tag: {
      type: "common",
      id: "picture",
      value: { data: new Uint8Array(MAX_LOCAL_AUDIO_EMBEDDED_COVER_BYTES) }
    }
  });
  assert.throws(
    () => observer({
      tag: { type: "common", id: "picture", value: { data: new Uint8Array(1) } }
    }),
    LocalAudioMetadataLimitExceededError,
    "multiple covers share one cumulative decoded-byte budget"
  );

  const longTitle = "题".repeat(MAX_LOCAL_AUDIO_TITLE_CHARACTERS + 1);
  const form = new FormData();
  form.set("file", new File([createId3TitleFixture(longTitle)], "long-title.mp3", { type: "audio/mpeg" }));
  const localResponse = await parseLocalAudio(formRequest(form));
  assert.equal(localResponse.status, 413);
  assert.equal(
    (await localResponse.json() as { code: string }).code,
    "local_audio_metadata_too_large"
  );
}

function assertDesktopWiring() {
  const main = readFileSync("electron/main.js", "utf8");
  const client = readFileSync("lib/ai/client.ts", "utf8");
  const prepare = readFileSync("scripts/prepare-electron-dist.mjs", "utf8");
  assert.match(main, /consumeOpenAICompatibleSSE/);
  assert.match(main, /createAIStreamDeadline/);
  assert.match(client, /consumeOpenAICompatibleSSE/);
  assert.match(client, /createAIStreamDeadline/);
  assert.match(prepare, /electron["'], ["']ai-stream\.js/);
  assert.match(prepare, /electron["'], ["']resource-budgets\.json/);
}

function countingJsonRequest(
  path: string,
  bytes: Uint8Array,
  options: { chunkSize?: number; contentLength?: string } = {}
) {
  const chunkSize = options.chunkSize ?? 16;
  let offset = 0;
  let pulledBytes = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, bytes.byteLength);
      const chunk = bytes.slice(offset, end);
      offset = end;
      pulledBytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    }
  }, { highWaterMark: 0 });
  const headers = appHeaders("application/json");
  if (options.contentLength !== undefined) headers.set("content-length", options.contentLength);
  const init: RequestInit & { duplex: "half" } = { method: "POST", headers, body, duplex: "half" };
  return {
    request: new Request(`${APP_ORIGIN}${path}`, init),
    stats: {
      get pulledBytes() { return pulledBytes; },
      get cancelled() { return cancelled; }
    }
  };
}

function jsonRequest(path: string, body: unknown, signal?: AbortSignal) {
  return new Request(`${APP_ORIGIN}${path}`, {
    method: "POST",
    headers: appHeaders("application/json"),
    body: JSON.stringify(body),
    signal
  });
}

function formRequest(body: FormData) {
  return new Request(`${APP_ORIGIN}/api/parse-local-audio`, {
    method: "POST",
    headers: {
      origin: APP_ORIGIN,
      [APP_REQUEST_HEADER_NAME]: APP_REQUEST_HEADER_VALUE
    },
    body
  });
}

function appHeaders(contentType: string) {
  return new Headers({
    origin: APP_ORIGIN,
    "content-type": contentType,
    [APP_REQUEST_HEADER_NAME]: APP_REQUEST_HEADER_VALUE
  });
}

function oversizedDeclaredJsonResponse(limit: number) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{}"));
      controller.close();
    }
  }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-length": String(limit + 1)
    }
  });
}

function oversizedStreamedJsonResponse(limit: number) {
  let remaining = limit + 1;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (remaining === 0) {
        controller.close();
        return;
      }
      const length = Math.min(64 * 1024, remaining);
      remaining -= length;
      controller.enqueue(new Uint8Array(length));
    }
  }, { highWaterMark: 0 }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function streamResponse(chunks: Uint8Array[]) {
  let index = 0;
  let cancelled = false;
  let pulls = 0;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[index++]);
    },
    cancel() {
      cancelled = true;
    }
  }, { highWaterMark: 0 }), { headers: { "content-type": "text/event-stream" } });
  return { response, stats: { get cancelled() { return cancelled; }, get pulls() { return pulls; } } };
}

function pendingStreamResponse() {
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull() {},
    cancel() { cancelled = true; }
  }, { highWaterMark: 0 }), { headers: { "content-type": "text/event-stream" } });
  return { response, stats: { get cancelled() { return cancelled; } } };
}

function heartbeatStreamResponse(delayMs: number) {
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    async pull(controller) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (!cancelled) controller.enqueue(new TextEncoder().encode(": fixture heartbeat\n\n"));
    },
    cancel() { cancelled = true; }
  }, { highWaterMark: 0 }), { headers: { "content-type": "text/event-stream" } });
  return { response, stats: { get cancelled() { return cancelled; } } };
}

function testStreamLimits(overrides: Partial<typeof resourceBudgets.aiStream>) {
  return {
    singleEventBytes: 512,
    bufferBytes: 1024,
    outputBytes: 1024,
    reasoningBytes: 1024,
    idleTimeoutMs: 100,
    totalDeadlineMs: 1000,
    ...overrides
  };
}

async function assertStreamCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof AIStreamError && error.code === code,
    `expected AI stream error ${code}`
  );
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

async function withLocalServer(
  handler: RequestListener,
  operation: (origin: string) => Promise<void>
) {
  const server: Server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await operation(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function createId3TitleFixture(title: string) {
  const encoder = new TextEncoder();
  const titleBytes = encoder.encode(title);
  const payload = new Uint8Array(titleBytes.byteLength + 1);
  payload[0] = 3;
  payload.set(titleBytes, 1);
  const frame = new Uint8Array(10 + payload.byteLength);
  frame.set(encoder.encode("TIT2"), 0);
  new DataView(frame.buffer).setUint32(4, payload.byteLength);
  frame.set(payload, 10);
  const header = new Uint8Array(10);
  header.set(encoder.encode("ID3"), 0);
  header.set([3, 0, 0], 3);
  header.set(toSynchsafe(frame.byteLength), 6);
  const fixture = new Uint8Array(header.byteLength + frame.byteLength + 8);
  fixture.set(header, 0);
  fixture.set(frame, header.byteLength);
  return fixture;
}

function toSynchsafe(value: number) {
  return new Uint8Array([
    (value >>> 21) & 0x7f,
    (value >>> 14) & 0x7f,
    (value >>> 7) & 0x7f,
    value & 0x7f
  ]);
}
