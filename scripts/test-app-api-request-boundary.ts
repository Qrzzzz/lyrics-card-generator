import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POST as translate } from "../app/api/ai/translate/route";
import { POST as fetchLyrics } from "../app/api/fetch-lyrics/route";
import { POST as parseLocalAudio } from "../app/api/parse-local-audio/route";
import { POST as parseSong } from "../app/api/parse-song/route";
import { POST as resolveSearchedSong } from "../app/api/resolve-searched-song/route";
import { POST as searchSong } from "../app/api/search-song/route";
import {
  APP_REQUEST_HEADER_NAME,
  APP_REQUEST_HEADER_VALUE,
  createAppRequestHeaders
} from "../lib/app-request";

const APP_ORIGIN = "http://127.0.0.1:3210";
const CROSS_SITE_ORIGIN = "https://example.invalid";
const originalFetch = globalThis.fetch;
let providerCalls = 0;

const jsonRoutes = [
  ["search-song", searchSong],
  ["resolve-searched-song", resolveSearchedSong],
  ["fetch-lyrics", fetchLyrics],
  ["parse-song", parseSong]
] as const;

async function main() {
try {
  globalThis.fetch = async (input, init) => {
    providerCalls += 1;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    assert.match(url, /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):11434\/v1\/chat\/completions$/);
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
    "http://127.0.0.1:11434/v1",
    "http://localhost:11434/v1",
    "http://[::1]:11434/v1"
  ]) {
    const response = await translate(jsonRequest("/api/ai/translate", aiBody(baseUrl)));
    assert.equal(response.status, 200, `${baseUrl} remains available as a custom provider`);
    assert.deepEqual(await response.json(), { choices: [{ message: { content: "translated" } }] });
  }
  assert.equal(providerCalls, 3);

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

  const crossSiteForm = new FormData();
  const rejectedCrossSiteForm = await parseLocalAudio(formRequest(crossSiteForm, CROSS_SITE_ORIGIN));
  await assertStandardRejection(rejectedCrossSiteForm, 403, "cross_origin_request", "parse-local-audio cross-site origin");

  const rejectedJsonForm = await parseLocalAudio(jsonRequest("/api/parse-local-audio", {}));
  await assertStandardRejection(rejectedJsonForm, 415, "unsupported_media_type", "parse-local-audio media type");

  const acceptedForm = await parseLocalAudio(formRequest(new FormData(), APP_ORIGIN));
  assert.equal(acceptedForm.status, 400, "parse-local-audio accepts same-origin app multipart before form validation");
  assert.equal((await acceptedForm.json() as { code?: string }).code, "local_audio_missing_file");

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
