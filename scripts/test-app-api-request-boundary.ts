import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POST as translate } from "../app/api/ai/translate/route";
import { POST as fetchLyrics } from "../app/api/fetch-lyrics/route";
import { POST as parseLocalAudio } from "../app/api/parse-local-audio/route";
import { POST as parseSong } from "../app/api/parse-song/route";
import { POST as resolveSearchedSong } from "../app/api/resolve-searched-song/route";
import { POST as searchSong } from "../app/api/search-song/route";
import {
  APP_CANONICAL_ORIGIN_ENV,
  APP_REQUEST_HEADER_NAME,
  APP_REQUEST_HEADER_VALUE,
  APP_TRUST_PROXY_ENV,
  createAppRequestHeaders
} from "../lib/app-request";
import {
  LOCAL_AUDIO_MULTIPART_OVERHEAD_BYTES,
  MAX_LOCAL_AUDIO_BYTES,
  MAX_LOCAL_AUDIO_EMBEDDED_COVER_BYTES,
  MAX_LOCAL_AUDIO_LYRICS_CHARACTERS,
  MAX_LOCAL_AUDIO_REQUEST_BYTES,
  isLocalAudioFileTooLarge
} from "../lib/local-audio-limits";
import {
  localAudioFileSizeRejection,
  localAudioMetadataSizeRejection,
  readLocalAudioMultipart
} from "../lib/local-audio-request";

const APP_ORIGIN = "http://127.0.0.1:3210";
const CROSS_SITE_ORIGIN = "https://example.invalid";
const originalFetch = globalThis.fetch;
const originalAppOrigin = process.env[APP_CANONICAL_ORIGIN_ENV];
const originalTrustProxy = process.env[APP_TRUST_PROXY_ENV];
const originalNodeEnv = process.env.NODE_ENV;
let providerCalls = 0;

const jsonRoutes = [
  ["search-song", searchSong],
  ["resolve-searched-song", resolveSearchedSong],
  ["fetch-lyrics", fetchLyrics],
  ["parse-song", parseSong]
] as const;

async function main() {
try {
  setAppOriginEnvironment(APP_ORIGIN, "0");
  // Replace outbound provider traffic so a boundary rejection is observable as
  // both an HTTP result and the absence of any upstream call.
  globalThis.fetch = async (input, init) => {
    providerCalls += 1;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const providerUrl = new URL(url);
    const isExpectedHttpsProvider = providerUrl.protocol === "https:" && providerUrl.hostname === "api.example.com";
    const isExpectedLoopbackProvider = providerUrl.protocol === "http:"
      && ["127.0.0.1", "localhost", "[::1]"].includes(providerUrl.hostname);
    assert.ok(isExpectedHttpsProvider || isExpectedLoopbackProvider, `unexpected provider target: ${url}`);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer local-key");
    return Response.json({ choices: [{ message: { content: "translated" } }] });
  };

  const rejectedCrossSite = await translate(jsonRequest("/api/ai/translate", aiBody("http://127.0.0.1:11434/v1"), {
    origin: CROSS_SITE_ORIGIN
  }));
  assert.equal(rejectedCrossSite.status, 403);
  assert.equal((await rejectedCrossSite.json() as { error: { code: string } }).error.code, "cross_origin_request");

  const rejectedMediaType = await translate(jsonRequest(
    "/api/ai/translate",
    aiBody("http://127.0.0.1:11434/v1"),
    { contentType: "text/plain" }
  ));
  assert.equal(rejectedMediaType.status, 415);
  assert.equal((await rejectedMediaType.json() as { error: { code: string } }).error.code, "unsupported_media_type");
  assert.equal(providerCalls, 0, "rejected AI requests must not contact a provider");

  for (const baseUrl of [
    "http://api.example.com/v1",
    "http://192.168.1.20:11434/v1",
    "http://localhost.evil.example/v1"
  ]) {
    const response = await translate(jsonRequest("/api/ai/translate", aiBody(baseUrl)));
    assert.equal(response.status, 400, `${baseUrl} is rejected before provider fetch`);
    assert.equal((await response.json() as { error: { code: string } }).error.code, "insecure_base_url");
  }
  assert.equal(providerCalls, 0, "remote HTTP rejection sends no credential or prompt bytes");

  const remoteHttps = await translate(jsonRequest("/api/ai/translate", aiBody("https://api.example.com/v1")));
  assert.equal(remoteHttps.status, 200, "remote HTTPS remains supported");
  assert.deepEqual(await remoteHttps.json(), { choices: [{ message: { content: "translated" } }] });

  for (const baseUrl of [
    "http://127.0.0.1:11434/v1",
    "http://localhost:11434/v1",
    "http://[::1]:11434/v1"
  ]) {
    const response = await translate(jsonRequest("/api/ai/translate", aiBody(baseUrl)));
    assert.equal(response.status, 200, `${baseUrl} remains available as a custom provider`);
    assert.deepEqual(await response.json(), { choices: [{ message: { content: "translated" } }] });
  }
  assert.equal(providerCalls, 4);

  for (const [name, route] of jsonRoutes) {
    const providerCallsBefore: number = providerCalls;
    const crossSite = await route(jsonRequest(`/api/${name}`, {}, { origin: CROSS_SITE_ORIGIN }));
    await assertStandardRejection(crossSite, 403, "cross_origin_request", `${name} cross-site origin`);

    const wrongMediaType = await route(jsonRequest(`/api/${name}`, {}, { contentType: "text/plain" }));
    await assertStandardRejection(wrongMediaType, 415, "unsupported_media_type", `${name} media type`);

    const acceptedBoundary = await route(jsonRequest(`/api/${name}`, {}));
    assert.equal(acceptedBoundary.status, 400, `${name} accepts same-origin app JSON before body validation`);
    const acceptedBody = await acceptedBoundary.json() as { code?: string };
    assert.equal(acceptedBody.code, "invalid_request", `${name} reaches body validation after the boundary`);
    assert.equal(providerCalls, providerCallsBefore, `${name} boundary cases do not contact an upstream service`);
  }

  await assertAppOriginBoundary();

  const crossSiteForm = new FormData();
  const rejectedCrossSiteForm = await parseLocalAudio(formRequest(crossSiteForm, CROSS_SITE_ORIGIN));
  await assertStandardRejection(rejectedCrossSiteForm, 403, "cross_origin_request", "parse-local-audio cross-site origin");

  const rejectedJsonForm = await parseLocalAudio(jsonRequest("/api/parse-local-audio", {}));
  await assertStandardRejection(rejectedJsonForm, 415, "unsupported_media_type", "parse-local-audio media type");

  const acceptedForm = await parseLocalAudio(formRequest(new FormData(), APP_ORIGIN));
  assert.equal(acceptedForm.status, 400, "parse-local-audio accepts same-origin app multipart before form validation");
  assert.equal((await acceptedForm.json() as { code?: string }).code, "local_audio_missing_file");

  await assertLocalAudioUploadLimits();

  const nextConfigSource = readFileSync("next.config.mjs", "utf8");
  assert.match(
    nextConfigSource,
    /images:\s*\{\s*unoptimized:\s*true\s*\}/,
    "Next image optimization stays disabled so image-proxy cannot reach sharp with untrusted bytes"
  );

  const missingMarker = new Request(`${APP_ORIGIN}/api/parse-song`, {
    method: "POST",
    headers: { origin: APP_ORIGIN, "content-type": "application/json" },
    body: "{}"
  });
  await assertStandardRejection(
    await parseSong(missingMarker),
    403,
    "missing_app_request_marker",
    "missing app request marker"
  );

  const missingOrigin = new Request(`${APP_ORIGIN}/api/parse-song`, {
    method: "POST",
    headers: createAppRequestHeaders({ "content-type": "application/json" }),
    body: "{}"
  });
  await assertStandardRejection(
    await parseSong(missingOrigin),
    403,
    "cross_origin_request",
    "missing Origin is rejected"
  );

  const fetchSiteMismatch = jsonRequest("/api/parse-song", {}, { secFetchSite: "cross-site" });
  await assertStandardRejection(
    await parseSong(fetchSiteMismatch),
    403,
    "cross_origin_request",
    "cross-site fetch metadata"
  );

  const browserHeaders = createAppRequestHeaders({ "content-type": "application/json" });
  assert.equal(browserHeaders.get(APP_REQUEST_HEADER_NAME), APP_REQUEST_HEADER_VALUE);
  assert.equal(browserHeaders.get("content-type"), "application/json");

  for (const [file, endpoints] of [
    ["lib/ai/client.ts", ["/api/ai/translate"]],
    ["components/editor/LocalAudioParser.tsx", ["/api/parse-local-audio"]],
    ["components/editor/LyricsFetchPanel.tsx", ["/api/fetch-lyrics"]],
    ["components/editor/SongLinkParser.tsx", ["/api/parse-song"]],
    ["components/editor/SongSearchParser.tsx", ["/api/search-song", "/api/resolve-searched-song"]],
    ["components/editor/hooks/useEditorActions.ts", ["/api/parse-song"]]
  ] as const) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /createAppRequestHeaders/, `${file} uses the shared app request marker`);
    for (const endpoint of endpoints) {
      assert.ok(source.includes(`fetch("${endpoint}"`), `${file} keeps the ${endpoint} call covered`);
    }
  }

  console.log("app API same-origin and media-type boundary tests passed");
} finally {
  globalThis.fetch = originalFetch;
  restoreEnvironment(APP_CANONICAL_ORIGIN_ENV, originalAppOrigin);
  restoreEnvironment(APP_TRUST_PROXY_ENV, originalTrustProxy);
  restoreEnvironment("NODE_ENV", originalNodeEnv);
}
}

void main();

function aiBody(baseUrl: string) {
  return {
    prompt: "Translate this line.",
    reasoning: false,
    settings: {
      baseUrl,
      model: "local-model",
      apiKey: "local-key",
      temperature: 0.2
    }
  };
}

async function assertAppOriginBoundary() {
  setAppOriginEnvironment(APP_ORIGIN, "0");

  await assertBoundaryAccepted(
    await parseSong(originBoundaryRequest({
      requestUrl: "http://localhost:3210/api/parse-song",
      origin: APP_ORIGIN,
      host: "attacker.invalid",
      forwardedHost: "attacker.invalid",
      forwardedProto: "https"
    })),
    "packaged Electron accepts its injected dynamic origin without trusting Host or forwarded headers"
  );

  const browserOrigin = "http://localhost:3000";
  setAppOriginEnvironment(browserOrigin, "0");
  await assertBoundaryAccepted(
    await parseSong(originBoundaryRequest({
      requestUrl: `${browserOrigin}/api/parse-song`,
      origin: browserOrigin
    })),
    "configured direct browser origin is accepted"
  );

  const ignoredForwarded = await parseSong(originBoundaryRequest({
    requestUrl: `${browserOrigin}/api/parse-song`,
    origin: browserOrigin,
    host: "127.0.0.1:3000",
    forwardedHost: "evil.example",
    forwardedProto: "https"
  }));
  await assertBoundaryAccepted(ignoredForwarded, "untrusted forwarded headers are ignored");

  await assertStandardRejection(
    await parseSong(originBoundaryRequest({
      requestUrl: `${browserOrigin}/api/parse-song`,
      origin: "https://evil.example",
      host: "evil.example",
      forwardedHost: "evil.example",
      forwardedProto: "https"
    })),
    403,
    "cross_origin_request",
    "forged Host, forwarded host, Origin, and static marker cannot replace the configured origin"
  );

  delete process.env[APP_CANONICAL_ORIGIN_ENV];
  process.env[APP_TRUST_PROXY_ENV] = "0";
  setEnvironment("NODE_ENV", "production");
  await assertStandardRejection(
    await parseSong(originBoundaryRequest({
      requestUrl: `${APP_ORIGIN}/api/parse-song`,
      origin: APP_ORIGIN,
      host: "127.0.0.1:3210",
      forwardedHost: "127.0.0.1:3210",
      forwardedProto: "http"
    })),
    503,
    "app_origin_configuration_error",
    "production does not treat a loopback-looking request URL, Host, matching Origin, or marker as configuration"
  );

  const providerCallsBeforeConfigurationFailure = providerCalls;
  const aiConfigurationFailure = await translate(jsonRequest(
    "/api/ai/translate",
    aiBody("http://127.0.0.1:11434/v1")
  ));
  assert.equal(aiConfigurationFailure.status, 503, "AI route reports the shared origin configuration failure");
  assert.equal(
    (await aiConfigurationFailure.json() as { error: { code: string } }).error.code,
    "app_origin_configuration_error"
  );
  assert.equal(providerCalls, providerCallsBeforeConfigurationFailure, "origin configuration failures never reach AI providers");

  const proxyOrigin = "https://lyrics.example.com";
  setAppOriginEnvironment(proxyOrigin, "1");
  await assertBoundaryAccepted(
    await parseSong(originBoundaryRequest({
      requestUrl: "http://127.0.0.1:3000/api/parse-song",
      origin: proxyOrigin,
      host: "internal.invalid:3000",
      forwardedHost: "lyrics.example.com",
      forwardedProto: "https"
    })),
    "trusted proxy accepts the exact configured canonical origin"
  );

  for (const [label, options] of [
    ["forwarded host mismatch", { origin: proxyOrigin, forwardedHost: "evil.example", forwardedProto: "https" }],
    ["forwarded protocol mismatch", { origin: proxyOrigin, forwardedHost: "lyrics.example.com", forwardedProto: "http" }],
    ["origin mismatch", { origin: "https://evil.example", forwardedHost: "lyrics.example.com", forwardedProto: "https" }],
    ["missing forwarded host", { origin: proxyOrigin, forwardedProto: "https" }],
    ["missing forwarded protocol", { origin: proxyOrigin, forwardedHost: "lyrics.example.com" }],
    ["multiple forwarded hosts", { origin: proxyOrigin, forwardedHost: "lyrics.example.com, evil.example", forwardedProto: "https" }],
    ["multiple forwarded protocols", { origin: proxyOrigin, forwardedHost: "lyrics.example.com", forwardedProto: "https, http" }]
  ] as const) {
    await assertStandardRejection(
      await parseSong(originBoundaryRequest({
        requestUrl: "http://127.0.0.1:3000/api/parse-song",
        host: "internal.invalid:3000",
        ...options
      })),
      403,
      "cross_origin_request",
      `trusted proxy ${label}`
    );
  }

  for (const [label, canonicalOrigin, forwardedHost, forwardedProto] of [
    ["IPv4 port mismatch", "http://127.0.0.1:4321", "127.0.0.1:4322", "http"],
    ["IPv4 alternate spelling", "http://127.0.0.1:4321", "127.1:4321", "http"],
    ["IPv6 alternate spelling", "http://[::1]:4321", "[0:0:0:0:0:0:0:1]:4321", "http"],
    ["default HTTPS port spelling", proxyOrigin, "lyrics.example.com:443", "https"],
    ["protocol mismatch", proxyOrigin, "lyrics.example.com", "http"]
  ] as const) {
    setAppOriginEnvironment(canonicalOrigin, "1");
    await assertStandardRejection(
      await parseSong(originBoundaryRequest({
        origin: canonicalOrigin,
        forwardedHost,
        forwardedProto
      })),
      403,
      "cross_origin_request",
      label
    );
  }

  for (const [canonicalOrigin, forwardedHost] of [
    ["http://127.0.0.1:4321", "127.0.0.1:4321"],
    ["http://[::1]:4321", "[::1]:4321"]
  ] as const) {
    setAppOriginEnvironment(canonicalOrigin, "1");
    await assertBoundaryAccepted(
      await parseSong(originBoundaryRequest({
        origin: canonicalOrigin,
        forwardedHost,
        forwardedProto: "http"
      })),
      `${canonicalOrigin} remains supported through an exact trusted proxy origin`
    );
  }

  for (const [label, canonicalOrigin, suppliedOrigin, forwardedHost] of [
    ["origin default port spelling", proxyOrigin, "https://lyrics.example.com:443", "lyrics.example.com"],
    ["origin IPv4 alternate spelling", "http://127.0.0.1:4321", "http://127.1:4321", "127.0.0.1:4321"],
    ["origin IPv6 alternate spelling", "http://[::1]:4321", "http://[0:0:0:0:0:0:0:1]:4321", "[::1]:4321"]
  ] as const) {
    setAppOriginEnvironment(canonicalOrigin, "1");
    await assertStandardRejection(
      await parseSong(originBoundaryRequest({
        origin: suppliedOrigin,
        forwardedHost,
        forwardedProto: canonicalOrigin.startsWith("https:") ? "https" : "http"
      })),
      403,
      "cross_origin_request",
      label
    );
  }

  for (const invalidOrigin of [
    "",
    " https://lyrics.example.com",
    "HTTPS://lyrics.example.com",
    "https://lyrics.example.com/",
    "https://lyrics.example.com:443",
    "https://user@lyrics.example.com",
    "ftp://lyrics.example.com"
  ]) {
    setAppOriginEnvironment(invalidOrigin, "0");
    await assertStandardRejection(
      await parseSong(originBoundaryRequest({ origin: proxyOrigin })),
      503,
      "app_origin_configuration_error",
      `invalid canonical origin ${JSON.stringify(invalidOrigin)}`
    );
  }

  setAppOriginEnvironment(proxyOrigin, "true");
  await assertStandardRejection(
    await parseSong(originBoundaryRequest({ origin: proxyOrigin })),
    503,
    "app_origin_configuration_error",
    "invalid trusted proxy setting"
  );

  delete process.env[APP_CANONICAL_ORIGIN_ENV];
  process.env[APP_TRUST_PROXY_ENV] = "1";
  await assertStandardRejection(
    await parseSong(originBoundaryRequest({
      origin: proxyOrigin,
      forwardedHost: "lyrics.example.com",
      forwardedProto: "https"
    })),
    503,
    "app_origin_configuration_error",
    "trusted proxy mode requires an explicit canonical origin"
  );

  const appRequestSource = readFileSync("lib/app-request.ts", "utf8");
  assert.doesNotMatch(appRequestSource, /headers\.get\(["']host["']\)/, "client Host never authorizes app mutations");
  assert.doesNotMatch(appRequestSource, /request\.url/, "request URL never becomes the canonical origin");

  const electronMainSource = readFileSync("electron/main.js", "utf8");
  assert.match(electronMainSource, /\[APP_CANONICAL_ORIGIN_ENV\]: url/);
  assert.match(electronMainSource, /\[APP_TRUST_PROXY_ENV\]: "0"/);
  const electronDevSource = readFileSync("scripts/start-electron-dev.mjs", "utf8");
  assert.match(electronDevSource, /LYRICS_CARD_APP_ORIGIN: url/);
  assert.match(electronDevSource, /LYRICS_CARD_TRUST_PROXY: "0"/);
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: { dev?: string; "dev:clean"?: string };
  };
  assert.match(packageJson.scripts?.dev ?? "", /LYRICS_CARD_APP_ORIGIN=http:\/\/localhost:3000/);
  assert.match(packageJson.scripts?.dev ?? "", /LYRICS_CARD_TRUST_PROXY=0/);
  assert.match(packageJson.scripts?.["dev:clean"] ?? "", /npm run dev/, "clean development reuses the pinned origin");

  setAppOriginEnvironment(APP_ORIGIN, "0");
}

function originBoundaryRequest(options: {
  origin: string;
  requestUrl?: string;
  host?: string;
  forwardedHost?: string;
  forwardedProto?: string;
}) {
  const headers = createAppRequestHeaders({
    origin: options.origin,
    "content-type": "application/json"
  });
  if (options.host !== undefined) headers.set("host", options.host);
  if (options.forwardedHost !== undefined) headers.set("x-forwarded-host", options.forwardedHost);
  if (options.forwardedProto !== undefined) headers.set("x-forwarded-proto", options.forwardedProto);
  return new Request(options.requestUrl ?? "http://next.internal:3000/api/parse-song", {
    method: "POST",
    headers,
    body: "{}"
  });
}

async function assertBoundaryAccepted(response: Response, label: string) {
  assert.equal(response.status, 400, label);
  assert.equal((await response.json() as { code?: string }).code, "invalid_request", label);
}

function setAppOriginEnvironment(origin: string, trustProxy: string) {
  process.env[APP_CANONICAL_ORIGIN_ENV] = origin;
  process.env[APP_TRUST_PROXY_ENV] = trustProxy;
}

function setEnvironment(name: string, value: string) {
  process.env[name] = value;
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function jsonRequest(
  path: string,
  body: unknown,
  options: { origin?: string; contentType?: string; secFetchSite?: string } = {}
) {
  const headers = new Headers({
    origin: options.origin ?? APP_ORIGIN,
    "content-type": options.contentType ?? "application/json; charset=utf-8",
    [APP_REQUEST_HEADER_NAME]: APP_REQUEST_HEADER_VALUE
  });
  if (options.secFetchSite) {
    headers.set("sec-fetch-site", options.secFetchSite);
  }
  return new Request(`${APP_ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function formRequest(body: FormData, origin: string) {
  return new Request(`${APP_ORIGIN}/api/parse-local-audio`, {
    method: "POST",
    headers: {
      origin,
      [APP_REQUEST_HEADER_NAME]: APP_REQUEST_HEADER_VALUE
    },
    body
  });
}

async function assertStandardRejection(
  response: Response,
  status: number,
  code: string,
  label: string
) {
  assert.equal(response.status, status, label);
  const body = await response.json() as { ok: boolean; error: string; code: string };
  assert.equal(body.ok, false, label);
  assert.ok(body.error, `${label} preserves the error field`);
  assert.equal(body.code, code, label);
}

async function assertLocalAudioUploadLimits() {
  // Exercise declared, missing, and deceptive content lengths because only the
  // streaming counter can enforce the latter two cases safely.
  assert.equal(MAX_LOCAL_AUDIO_BYTES, 100 * 1024 * 1024, "the exact file limit remains 100 MiB");
  assert.equal(
    MAX_LOCAL_AUDIO_REQUEST_BYTES,
    MAX_LOCAL_AUDIO_BYTES + LOCAL_AUDIO_MULTIPART_OVERHEAD_BYTES,
    "the request limit only adds the explicit multipart allowance"
  );

  const knownOversizedContentLength = 101 * 1024 * 1024;
  assert.ok(knownOversizedContentLength > MAX_LOCAL_AUDIO_REQUEST_BYTES);
  const knownOversized = countingMultipartRequest(
    new Uint8Array([1, 2, 3, 4]),
    "multipart/form-data; boundary=known-oversized",
    { contentLength: String(knownOversizedContentLength) }
  );
  await assertStandardRejection(
    await parseLocalAudio(knownOversized.request),
    413,
    "local_audio_too_large",
    "known oversized local-audio request"
  );
  assert.equal(knownOversized.stats.pulledBytes, 0, "known oversized Content-Length is rejected before body reads");
  assert.equal(knownOversized.stats.cancelled, true, "known oversized request actively cancels its body");

  const scaledOversized = await serializedAudioMultipart(101);
  const streamingLimit = scaledOversized.bytes.byteLength - 32;
  const missingLength = countingMultipartRequest(
    scaledOversized.bytes,
    scaledOversized.contentType,
    { chunkSize: 7 }
  );
  const missingLengthResult = await readLocalAudioMultipart(missingLength.request, streamingLimit);
  assert.equal(missingLengthResult.ok, false, "missing Content-Length still uses the streaming limit");
  if (missingLengthResult.ok) assert.fail("missing-length oversized multipart unexpectedly passed");
  await assertStandardRejection(
    missingLengthResult.response,
    413,
    "local_audio_too_large",
    "missing-length oversized multipart"
  );
  assert.ok(
    missingLength.stats.pulledBytes <= streamingLimit + 7,
    "streaming enforcement reads at most one source chunk beyond the limit"
  );
  assert.ok(
    missingLength.stats.pulledBytes < scaledOversized.bytes.byteLength,
    "streaming enforcement does not pull the complete scaled 101 MiB request"
  );
  assert.equal(missingLength.stats.cancelled, true, "streaming overflow cancels the upstream body");

  const deceptiveLength = countingMultipartRequest(
    scaledOversized.bytes,
    scaledOversized.contentType,
    { chunkSize: 7, contentLength: "1" }
  );
  const deceptiveLengthResult = await readLocalAudioMultipart(deceptiveLength.request, streamingLimit);
  assert.equal(deceptiveLengthResult.ok, false, "a deceptive small Content-Length cannot bypass streaming enforcement");
  if (deceptiveLengthResult.ok) assert.fail("deceptive-length oversized multipart unexpectedly passed");
  await assertStandardRejection(
    deceptiveLengthResult.response,
    413,
    "local_audio_too_large",
    "deceptive-length oversized multipart"
  );
  assert.ok(
    deceptiveLength.stats.pulledBytes < scaledOversized.bytes.byteLength,
    "deceptive-length enforcement stops before the complete request"
  );
  assert.equal(deceptiveLength.stats.cancelled, true, "deceptive-length overflow cancels the upstream body");

  const legal = await serializedAudioMultipart(100);
  assert.ok(
    legal.bytes.byteLength - 100 < LOCAL_AUDIO_MULTIPART_OVERHEAD_BYTES,
    "normal browser multipart metadata fits inside the explicit allowance"
  );
  const legalRequest = countingMultipartRequest(legal.bytes, legal.contentType, { chunkSize: 11 });
  const legalResult = await readLocalAudioMultipart(legalRequest.request, legal.bytes.byteLength);
  assert.equal(legalResult.ok, true, "a legal multipart body at its injected request limit is accepted");
  if (!legalResult.ok) assert.fail("legal multipart unexpectedly failed");
  assert.equal(legalResult.file.size, 100, "the legal file reaches the exact file-size check unchanged");
  assert.equal(localAudioFileSizeRejection(legalResult.file, 100), null, "an exact-limit file is not rejected");
  assert.equal(legalRequest.stats.pulledBytes, legal.bytes.byteLength, "legal multipart is consumed completely");

  const exactSizeRequest = countingMultipartRequest(
    scaledOversized.bytes,
    scaledOversized.contentType,
    { chunkSize: 13 }
  );
  const exactSizeResult = await readLocalAudioMultipart(exactSizeRequest.request, scaledOversized.bytes.byteLength);
  assert.equal(exactSizeResult.ok, true, "the scaled 101 MiB file reaches the exact file-size check");
  if (!exactSizeResult.ok) assert.fail("scaled oversized multipart failed before the file-size check");
  const exactSizeRejection = localAudioFileSizeRejection(exactSizeResult.file, 100);
  assert.ok(exactSizeRejection, "the scaled 101 MiB file is rejected by the exact file limit");
  await assertStandardRejection(
    exactSizeRejection,
    413,
    "local_audio_too_large",
    "exact local-audio file-size limit"
  );

  const malformed = countingMultipartRequest(
    new TextEncoder().encode("--malformed\r\nnot-a-form-field"),
    "multipart/form-data; boundary=malformed",
    { chunkSize: 8 }
  );
  const malformedResult = await readLocalAudioMultipart(malformed.request, 1024);
  assert.equal(malformedResult.ok, false, "malformed non-oversized multipart remains an error");
  if (malformedResult.ok) assert.fail("malformed multipart unexpectedly passed");
  await assertStandardRejection(
    malformedResult.response,
    400,
    "local_audio_invalid_multipart",
    "non-oversized malformed multipart"
  );

  const validAudio = new FormData();
  validAudio.set("file", new File([createId3AudioFixture()], "fixture.mp3", { type: "audio/mpeg" }));
  const parsedAudio = await parseLocalAudio(formRequest(validAudio, APP_ORIGIN));
  assert.equal(parsedAudio.status, 200, "a valid local-audio multipart request still parses");
  const parsedPayload = await parsedAudio.json() as {
    ok: boolean;
    data?: { title?: string; artist?: string; album?: string; lyrics?: string };
  };
  assert.equal(parsedPayload.ok, true);
  assert.equal(parsedPayload.data?.title, "Fixture Title");
  assert.equal(parsedPayload.data?.artist, "Fixture Artist");
  assert.equal(parsedPayload.data?.album, "Fixture Album");
  assert.equal(parsedPayload.data?.lyrics, "Fixture lyric");

  const validM4aAudio = new FormData();
  validM4aAudio.set("file", new File([createM4aAudioFixture()], "fixture.m4a", { type: "audio/mp4" }));
  const parsedM4aAudio = await parseLocalAudio(formRequest(validM4aAudio, APP_ORIGIN));
  assert.equal(parsedM4aAudio.status, 200, "a valid M4A multipart request parses iTunes metadata");
  const parsedM4aPayload = await parsedM4aAudio.json() as {
    ok: boolean;
    data?: { title?: string; artist?: string; album?: string; lyrics?: string; originalUrl?: string };
  };
  assert.equal(parsedM4aPayload.ok, true);
  assert.equal(parsedM4aPayload.data?.title, "Fixture M4A Title");
  assert.equal(parsedM4aPayload.data?.artist, "Fixture M4A Artist");
  assert.equal(parsedM4aPayload.data?.album, "Fixture M4A Album");
  assert.equal(parsedM4aPayload.data?.lyrics, "Fixture M4A lyric");
  assert.equal(parsedM4aPayload.data?.originalUrl, "fixture.m4a");

  const mismatchedExtensionAudio = new FormData();
  mismatchedExtensionAudio.set(
    "file",
    new File([createId3AudioFixture()], "mislabeled.flac", { type: "audio/mpeg" })
  );
  const parsedMismatchedExtensionAudio = await parseLocalAudio(
    formRequest(mismatchedExtensionAudio, APP_ORIGIN)
  );
  assert.equal(
    parsedMismatchedExtensionAudio.status,
    200,
    "a recognized MIME type retains precedence over a conflicting extension"
  );
  const parsedMismatchedExtensionPayload = await parsedMismatchedExtensionAudio.json() as {
    ok: boolean;
    data?: { title?: string; lyrics?: string };
  };
  assert.equal(parsedMismatchedExtensionPayload.ok, true);
  assert.equal(parsedMismatchedExtensionPayload.data?.title, "Fixture Title");
  assert.equal(parsedMismatchedExtensionPayload.data?.lyrics, "Fixture lyric");

  const apeAudio = new FormData();
  apeAudio.set("file", new File([createApeV2AudioFixture()], "ape-fixture.mp3", { type: "audio/mpeg" }));
  const parsedApeAudio = await parseLocalAudio(formRequest(apeAudio, APP_ORIGIN));
  assert.equal(parsedApeAudio.status, 200, "an MP3 with trailing APEv2 metadata still parses");
  const parsedApePayload = await parsedApeAudio.json() as {
    ok: boolean;
    data?: { title?: string; lyrics?: string };
  };
  assert.equal(parsedApePayload.ok, true);
  assert.equal(parsedApePayload.data?.title, "APE Fixture");
  assert.equal(parsedApePayload.data?.lyrics, "APE lyric");

  const routeSource = readFileSync("app/api/parse-local-audio/route.ts", "utf8");
  assert.match(
    routeSource,
    /fromBlob\(file, \{ fileInfo: \{ path: parserPath \} \}\)/,
    "music-metadata uses bounded random-access Blob reads with a stable parser hint"
  );
  assert.match(
    routeSource,
    /limitLocalAudioMetadataTokenizer\(tokenizer\)/,
    "token lengths are checked before music-metadata can allocate them"
  );
  assert.match(
    routeSource,
    /parseFromTokenizer\(limitedTokenizer, \{ observer: createLocalAudioMetadataObserver\(\) \}\)/,
    "the random-access tokenizer retains trailing-tag discovery with observer early-stop guards"
  );
  assert.doesNotMatch(routeSource, /parseWebStream\(/, "non-seekable parsing cannot silently skip trailing APEv2 tags");
  assert.doesNotMatch(routeSource, /file\.arrayBuffer\(\)/, "metadata parsing does not materialize a second full file copy");
  const metadataGuardIndex = routeSource.indexOf("const metadataSizeRejection = localAudioMetadataSizeRejection");
  const coverEncodingIndex = routeSource.indexOf("pictureDataToBase64(picture.data)");
  const lyricExpansionIndex = routeSource.indexOf("stripLrcTimestamps(rawLyrics)");
  assert.ok(
    metadataGuardIndex >= 0
      && metadataGuardIndex < coverEncodingIndex
      && metadataGuardIndex < lyricExpansionIndex,
    "embedded metadata budgets are checked before base64 and lyric expansion"
  );
  assert.match(
    routeSource,
    /Buffer\.from\(data\.buffer, data\.byteOffset, data\.byteLength\)\.toString\("base64"\)/,
    "accepted cover encoding reuses the parser buffer instead of copying it"
  );

  assert.equal(isLocalAudioFileTooLarge({ size: MAX_LOCAL_AUDIO_BYTES }), false);
  assert.equal(isLocalAudioFileTooLarge({ size: MAX_LOCAL_AUDIO_BYTES + 1 }), true);
  assert.equal(MAX_LOCAL_AUDIO_EMBEDDED_COVER_BYTES, 8 * 1024 * 1024);
  assert.equal(MAX_LOCAL_AUDIO_LYRICS_CHARACTERS, 256 * 1024);
  assert.equal(
    localAudioMetadataSizeRejection(
      [{ data: { byteLength: 40 } }, { data: { byteLength: 60 } }],
      "x".repeat(100),
      100,
      100
    ),
    null,
    "exact aggregate cover and lyrics budgets remain valid"
  );
  const oversizedCoverMetadata = localAudioMetadataSizeRejection(
    [{ data: { byteLength: 41 } }, { data: { byteLength: 60 } }],
    "",
    100,
    100
  );
  assert.ok(oversizedCoverMetadata);
  await assertStandardRejection(
    oversizedCoverMetadata,
    413,
    "local_audio_metadata_too_large",
    "aggregate embedded-cover budget"
  );
  const oversizedLyricsMetadata = localAudioMetadataSizeRejection([], "x".repeat(101), 100, 100);
  assert.ok(oversizedLyricsMetadata);
  await assertStandardRejection(
    oversizedLyricsMetadata,
    413,
    "local_audio_metadata_too_large",
    "embedded-lyrics budget"
  );
  const clientSource = readFileSync("components/editor/LocalAudioParser.tsx", "utf8");
  const clientGuardIndex = clientSource.indexOf("isLocalAudioFileTooLarge(file)");
  const beginImportIndex = clientSource.indexOf("const intent = await beginImport()", clientGuardIndex);
  const formDataIndex = clientSource.indexOf("new FormData()", clientGuardIndex);
  const fetchIndex = clientSource.indexOf('fetch("/api/parse-local-audio"', clientGuardIndex);
  assert.ok(clientGuardIndex >= 0, "the local-audio picker uses the shared size guard");
  assert.ok(
    clientGuardIndex < beginImportIndex && beginImportIndex < formDataIndex && formDataIndex < fetchIndex,
    "the client rejects an oversized selection before import setup, FormData construction, and fetch"
  );
  const clientGuard = clientSource.slice(clientGuardIndex, beginImportIndex);
  assert.match(clientGuard, /local_audio_too_large/);
  assert.match(clientGuard, /setStatus\("error"\)/);
  assert.match(clientGuard, /return;/, "the oversized client guard exits before fetch");

  console.log("local-audio upload byte-limit evidence", JSON.stringify({
    knownLengthPulledBytes: knownOversized.stats.pulledBytes,
    missingLengthPulledBytes: missingLength.stats.pulledBytes,
    deceptiveLengthPulledBytes: deceptiveLength.stats.pulledBytes,
    oversizedBodyBytes: scaledOversized.bytes.byteLength,
    knownLengthHeaderBytes: knownOversizedContentLength,
    injectedStreamingLimitBytes: streamingLimit,
    sourceChunkBytes: 7,
    browserMultipartOverheadBytes: legal.bytes.byteLength - 100
  }));
}

async function serializedAudioMultipart(fileBytes: number) {
  const formData = new FormData();
  formData.set("file", new File([new Uint8Array(fileBytes)], "scaled.mp3", { type: "audio/mpeg" }));
  const request = new Request(`${APP_ORIGIN}/api/parse-local-audio`, { method: "POST", body: formData });
  const contentType = request.headers.get("content-type");
  assert.ok(contentType, "serialized multipart request has a Content-Type boundary");
  return {
    bytes: new Uint8Array(await request.arrayBuffer()),
    contentType
  };
}

function countingMultipartRequest(
  bytes: Uint8Array,
  contentType: string,
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
  const headers = createAppRequestHeaders({
    origin: APP_ORIGIN,
    "content-type": contentType
  });
  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers,
    body,
    duplex: "half"
  };

  return {
    request: new Request(`${APP_ORIGIN}/api/parse-local-audio`, init),
    stats: {
      get pulledBytes() {
        return pulledBytes;
      },
      get cancelled() {
        return cancelled;
      }
    }
  };
}

function createId3AudioFixture() {
  const encoder = new TextEncoder();
  const frame = (id: string, payload: Uint8Array) => {
    const header = new Uint8Array(10);
    header.set(encoder.encode(id));
    new DataView(header.buffer).setUint32(4, payload.byteLength);
    const result = new Uint8Array(header.byteLength + payload.byteLength);
    result.set(header);
    result.set(payload, header.byteLength);
    return result;
  };
  const textFrame = (id: string, value: string) => {
    const text = encoder.encode(value);
    const payload = new Uint8Array(text.byteLength + 1);
    payload[0] = 3;
    payload.set(text, 1);
    return frame(id, payload);
  };
  const lyricText = encoder.encode("[00:01.00]Fixture lyric");
  const lyricPayload = new Uint8Array(1 + 3 + 1 + lyricText.byteLength);
  lyricPayload[0] = 3;
  lyricPayload.set(encoder.encode("eng"), 1);
  lyricPayload.set(lyricText, 5);
  const frames = [
    textFrame("TIT2", "Fixture Title"),
    textFrame("TPE1", "Fixture Artist"),
    textFrame("TALB", "Fixture Album"),
    frame("USLT", lyricPayload)
  ];
  const payloadBytes = frames.reduce((total, value) => total + value.byteLength, 0);
  const header = new Uint8Array([
    0x49,
    0x44,
    0x33,
    3,
    0,
    0,
    (payloadBytes >> 21) & 0x7f,
    (payloadBytes >> 14) & 0x7f,
    (payloadBytes >> 7) & 0x7f,
    payloadBytes & 0x7f
  ]);
  const fixture = new Uint8Array(header.byteLength + payloadBytes + (417 * 3));
  fixture.set(header);
  let offset = header.byteLength;
  for (const value of frames) {
    fixture.set(value, offset);
    offset += value.byteLength;
  }
  for (let frameOffset = offset; frameOffset < fixture.byteLength; frameOffset += 417) {
    fixture.set([0xff, 0xfb, 0x90, 0x64], frameOffset);
  }
  return fixture;
}

function createApeV2AudioFixture() {
  const encoder = new TextEncoder();
  const item = (key: string, value: string) => {
    const encodedValue = encoder.encode(value);
    return concatBytes(
      uint32Le(encodedValue.byteLength),
      uint32Le(0),
      encoder.encode(key),
      new Uint8Array([0]),
      encodedValue
    );
  };
  const audioFrames = new Uint8Array(417 * 3);
  for (let offset = 0; offset < audioFrames.byteLength; offset += 417) {
    audioFrames.set([0xff, 0xfb, 0x90, 0x64], offset);
  }
  const items = [
    item("Title", "APE Fixture"),
    item("Lyrics", "[00:01.00]APE lyric")
  ];
  const itemBytes = items.reduce((total, value) => total + value.byteLength, 0);
  const footer = concatBytes(
    encoder.encode("APETAGEX"),
    uint32Le(2000),
    uint32Le(itemBytes + 32),
    uint32Le(items.length),
    uint32Le(0),
    new Uint8Array(8)
  );
  return concatBytes(audioFrames, ...items, footer);
}

function createM4aAudioFixture() {
  const encoder = new TextEncoder();
  const atom = (type: string, ...payloads: Uint8Array[]) => {
    const payload = concatBytes(...payloads);
    const header = new Uint8Array(8);
    new DataView(header.buffer).setUint32(0, header.byteLength + payload.byteLength);
    header.set(Array.from(type, (character) => character.charCodeAt(0)), 4);
    return concatBytes(header, payload);
  };
  const textAtom = (type: string, value: string) => atom(
    type,
    atom("data", new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0]), encoder.encode(value))
  );

  return concatBytes(
    atom(
      "ftyp",
      new Uint8Array([0x4d, 0x34, 0x41, 0x20, 0, 0, 0, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32])
    ),
    atom(
      "moov",
      atom(
        "udta",
        atom(
          "meta",
          new Uint8Array(4),
          atom(
            "ilst",
            textAtom("©nam", "Fixture M4A Title"),
            textAtom("©ART", "Fixture M4A Artist"),
            textAtom("©alb", "Fixture M4A Album"),
            textAtom("©lyr", "[00:01.00]Fixture M4A lyric")
          )
        )
      )
    )
  );
}

function uint32Le(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concatBytes(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, value) => total + value.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}
