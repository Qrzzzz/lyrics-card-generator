import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import { POST as testConnectionRoute } from "../app/api/ai/test-connection/route";
import {
  AIProviderConnectionError,
  buildChatCompletionsRequestBody,
  buildConnectionTestRequestBody,
  getChatCompletionsUrl,
  INSECURE_BASE_URL_ERROR_CODE,
  INVALID_BASE_URL_ERROR_CODE,
  readProviderError,
  testAIProviderConnection,
  usesDeepSeekThinking
} from "../lib/ai/provider-request";
import {
  getChatCompletionMessage,
  getProviderErrorMessage,
  readProviderResponseBody
} from "../lib/ai/provider-response";

type ProviderRequestOptions = {
  baseUrl: string;
  model: string;
  prompt: string;
  reasoning?: boolean;
  temperature: number;
};

type ElectronProviderModule = {
  buildChatCompletionsRequestBody: (options: ProviderRequestOptions) => unknown;
  buildConnectionTestRequestBody: (model: string) => unknown;
  getChatCompletionsUrl: (baseUrl: string) => string;
  readProviderError: (response: Response) => Promise<string>;
  testProviderConnection: (options: {
    baseUrl: string;
    model: string;
    apiKey: string;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }) => Promise<boolean>;
  usesDeepSeekThinking: (baseUrl: string, model: string) => boolean;
};

const require = createRequire(import.meta.url);
// The renderer and Electron implementations must normalize the same provider
// payloads so moving a request across the IPC boundary cannot change semantics.
const electronProvider = require("../electron/provider-response.js") as ElectronProviderModule;

async function read(body: BodyInit | null, init?: ResponseInit) {
  return readProviderResponseBody(new Response(body, init));
}

async function main() {
  const jsonSuccess = await read(JSON.stringify({
    choices: [{ message: { content: "translated", reasoning_content: "reasoned" } }]
  }), { headers: { "content-type": "application/json" } });
  assert.deepEqual(getChatCompletionMessage(jsonSuccess), {
    content: "translated",
    reasoningContent: "reasoned"
  });

  const jsonError = await read(JSON.stringify({ error: { message: "bad key" } }), {
    status: 401,
    headers: { "content-type": "application/json" }
  });
  assert.equal(getProviderErrorMessage(jsonError, 401), "AI 接口请求失败：bad key");

  const textError = await read("provider overloaded", {
    status: 503,
    headers: { "content-type": "text/plain" }
  });
  assert.equal(getProviderErrorMessage(textError, 503), "AI 接口请求失败：provider overloaded");

  const malformedJson = await read("<html>nope</html>", {
    status: 502,
    headers: { "content-type": "application/json" }
  });
  assert.equal(malformedJson.kind, "text");
  assert.equal(getProviderErrorMessage(malformedJson, 502), "AI 接口请求失败：<html>nope</html>");

  const empty = await read("", { status: 500 });
  assert.equal(empty.kind, "empty");
  assert.equal(getProviderErrorMessage(empty, 500), "AI 接口请求失败（HTTP 500）。");

  const openAiEndpoint = "https://api.openai.com/v1";
  assert.equal(getChatCompletionsUrl(openAiEndpoint), "https://api.openai.com/v1/chat/completions");
  assert.equal(getChatCompletionsUrl(openAiEndpoint), electronProvider.getChatCompletionsUrl(openAiEndpoint));

  const acceptedHttpLoopbackUrls = [
    ["http://localhost:11434/v1", "http://localhost:11434/v1/chat/completions"],
    ["http://localhost.:11434/v1", "http://localhost.:11434/v1/chat/completions"],
    ["http://127.255.255.254:11434/v1", "http://127.255.255.254:11434/v1/chat/completions"],
    ["http://127.1:11434/v1", "http://127.0.0.1:11434/v1/chat/completions"],
    ["http://[0:0:0:0:0:0:0:1]:11434/v1", "http://[::1]:11434/v1/chat/completions"]
  ] as const;
  for (const [baseUrl, expected] of acceptedHttpLoopbackUrls) {
    assert.equal(getChatCompletionsUrl(baseUrl), expected, `${baseUrl} is normalized as loopback`);
    assert.equal(electronProvider.getChatCompletionsUrl(baseUrl), expected, `${baseUrl} matches Electron`);
  }

  const rejectedRemoteHttpUrls = [
    "http://api.example.com/v1",
    "http://192.168.1.20:11434/v1",
    "http://localhost.evil.example/v1",
    "http://127.0.0.1.example/v1",
    "http://127.0.0.1@evil.example/v1",
    "http://128.0.0.1/v1",
    "http://[::ffff:127.0.0.1]/v1"
  ];
  for (const baseUrl of rejectedRemoteHttpUrls) {
    assert.equal(captureThrownMessage(() => getChatCompletionsUrl(baseUrl)), INSECURE_BASE_URL_ERROR_CODE);
    assert.equal(
      captureThrownMessage(() => electronProvider.getChatCompletionsUrl(baseUrl)),
      INSECURE_BASE_URL_ERROR_CODE,
      `${baseUrl} matches Electron rejection`
    );
  }

  const openAiReasoningRequest = {
    baseUrl: openAiEndpoint,
    model: "gpt-4.1-mini",
    prompt: "hello",
    reasoning: true,
    temperature: 0.7
  } satisfies ProviderRequestOptions;
  assert.deepEqual(
    buildChatCompletionsRequestBody(openAiReasoningRequest),
    electronProvider.buildChatCompletionsRequestBody(openAiReasoningRequest)
  );

  const deepSeekRequest = {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    prompt: "hello",
    reasoning: false,
    temperature: 0.3
  } satisfies ProviderRequestOptions;
  assert.deepEqual(
    buildChatCompletionsRequestBody(deepSeekRequest),
    electronProvider.buildChatCompletionsRequestBody(deepSeekRequest)
  );

  assert.equal(usesDeepSeekThinking(openAiEndpoint, "deepseek-reasoner"), true);
  assert.equal(
    usesDeepSeekThinking("https://api.deepseek.com/v1", "gpt-4.1-mini"),
    electronProvider.usesDeepSeekThinking("https://api.deepseek.com/v1", "gpt-4.1-mini")
  );

  const webProviderError = await readProviderError(new Response("provider overloaded", {
    status: 503,
    headers: { "content-type": "text/plain" }
  }));
  const electronProviderError = await electronProvider.readProviderError(new Response("provider overloaded", {
    status: 503,
    headers: { "content-type": "text/plain" }
  }));
  assert.equal(webProviderError, electronProviderError);

  assert.equal(captureThrownMessage(() => getChatCompletionsUrl("mailto:test")), INVALID_BASE_URL_ERROR_CODE);
  assert.equal(
    captureThrownMessage(() => electronProvider.getChatCompletionsUrl("mailto:test")),
    INVALID_BASE_URL_ERROR_CODE
  );

  assert.deepEqual(
    buildConnectionTestRequestBody("  test-model  "),
    electronProvider.buildConnectionTestRequestBody("  test-model  "),
    "web and Electron use the same content-free, one-token probe"
  );

  for (const testConnection of [
    testAIProviderConnection,
    electronProvider.testProviderConnection
  ]) {
    let upstreamCalls = 0;
    await assert.rejects(
      testConnection({
        baseUrl: "http://attacker.example/v1",
        model: "test-model",
        apiKey: "test-key-never-log",
        fetchImpl: async () => {
          upstreamCalls += 1;
          return Response.json({ ok: true });
        }
      }),
      (error: unknown) => connectionErrorCode(error) === "insecure_base_url",
      "an unsafe Base URL is rejected by the final request boundary"
    );
    assert.equal(upstreamCalls, 0, "unsafe Base URLs cannot reach the injected upstream transport");

    let requestBody = "";
    await testConnection({
      baseUrl: "https://api.example.com/v1",
      model: "test-model",
      apiKey: "test-key-never-log",
      fetchImpl: async (_input, init) => {
        upstreamCalls += 1;
        assert.equal(init?.redirect, "error", "direct HTTPS calls use the same no-redirect policy");
        requestBody = String(init?.body ?? "");
        assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-key-never-log");
        return Response.json({ choices: [{ message: { content: "OK" } }] });
      }
    });
    assert.deepEqual(JSON.parse(requestBody), {
      model: "test-model",
      messages: [{ role: "user", content: "Reply with exactly OK." }],
      stream: false,
      temperature: 0,
      max_tokens: 1
    });
    assert.doesNotMatch(requestBody, /test-key-never-log|lyrics|歌词/i);
    assert.equal(upstreamCalls, 1);

    await assert.rejects(
      testConnection({
        baseUrl: "https://api.example.com/v1",
        model: "test-model",
        apiKey: "test-key-never-log",
        fetchImpl: async () => Response.json({
          error: { message: "provider echoed test-key-never-log" }
        }, { status: 401 })
      }),
      (error: unknown) => {
        const diagnostic = connectionErrorDiagnostic(error);
        assert.doesNotMatch(diagnostic, /test-key-never-log/);
        assert.match(diagnostic, /\[redacted\]/);
        return connectionErrorCode(error) === "provider_error";
      },
      "provider diagnostics cannot reflect the API key into the UI"
    );

    await assert.rejects(
      testConnection({
        baseUrl: "https://api.example.com/v1",
        model: "test-model",
        apiKey: "test-key-never-log",
        timeoutMs: 10,
        fetchImpl: abortAwarePendingFetch
      }),
      (error: unknown) => connectionErrorCode(error) === "timeout",
      "the connection probe has its own strict timeout"
    );

    const userController = new AbortController();
    userController.abort(new Error("fixture cancellation"));
    await assert.rejects(
      testConnection({
        baseUrl: "https://api.example.com/v1",
        model: "test-model",
        apiKey: "test-key-never-log",
        signal: userController.signal,
        fetchImpl: abortAwarePendingFetch
      }),
      (error: unknown) => connectionErrorCode(error) === "cancelled",
      "user cancellation is distinct from timeout"
    );
  }

  await testConnectionResponseContracts();

  console.log(JSON.stringify({
    ok: true,
    transportPolicyCases: acceptedHttpLoopbackUrls.length + rejectedRemoteHttpUrls.length + 6
  }, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });

function captureThrownMessage(fn: () => unknown) {
  try {
    fn();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function connectionErrorCode(error: unknown) {
  if (error instanceof AIProviderConnectionError) return error.code;
  if (error && typeof error === "object" && "connectionTestCode" in error) {
    return String(error.connectionTestCode);
  }
  if (error && typeof error === "object" && "code" in error && error.code === "response_too_large") {
    return "response_too_large";
  }
  return "";
}

function connectionErrorDiagnostic(error: unknown) {
  if (error instanceof AIProviderConnectionError) return error.diagnostic ?? "";
  if (error && typeof error === "object" && "diagnostic" in error) {
    return String(error.diagnostic ?? "");
  }
  return "";
}

const abortAwarePendingFetch: typeof fetch = async (_input, init) => await new Promise<Response>((_resolve, reject) => {
  const signal = init?.signal;
  if (signal?.aborted) {
    reject(signal.reason);
    return;
  }
  signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
});

async function testConnectionResponseContracts() {
  const completion = (message: unknown, finish_reason = "stop") => ({ choices: [{ message, finish_reason }] });
  const fixtures = [
    { name: "completion", body: completion({ content: "A" }) },
    { name: "empty-content", body: completion({ content: "" }, "length") },
    { name: "null-content", body: completion({ content: null }, "length") },
    { name: "reasoning", body: completion({ reasoning_content: "thinking" }, "length") },
    { name: "truncated-message", body: completion({}, "length") },
    { name: "refusal", body: completion({ content: null, refusal: "Cannot comply" }) },
    { name: "html", text: "<!doctype html><title>Dashboard</title>", code: "invalid_response" },
    { name: "malformed-json", text: "{broken", code: "invalid_response" },
    { name: "empty", text: "", status: 204, code: "invalid_response" },
    { name: "json-null", body: null, code: "invalid_response" },
    { name: "json-array", body: [], code: "invalid_response" },
    { name: "unrelated-json", body: { ok: true }, code: "invalid_response" },
    { name: "empty-choices", body: { choices: [] }, code: "invalid_response" },
    { name: "object-choices", body: { choices: { 0: { message: { content: "OK" } } } }, code: "invalid_response" },
    { name: "null-choice", body: { choices: [null] }, code: "invalid_response" },
    { name: "stream-delta", body: { choices: [{ delta: { content: "OK" } }] }, code: "invalid_response" },
    { name: "string-message", body: completion("OK"), code: "invalid_response" },
    { name: "empty-message", body: completion({}), code: "invalid_response" },
    { name: "wrong-content-type", body: completion({ content: 123 }), code: "invalid_response" },
    { name: "error-json", body: { error: { message: "Invalid model" } }, code: "provider_error" },
    { name: "error-string", body: { error: "Invalid model" }, code: "provider_error" },
    { name: "error-with-completion", body: { ...completion({ content: "OK" }), error: {} }, code: "provider_error" },
    { name: "unauthorized", body: { error: { message: "Invalid key" } }, status: 401, code: "provider_error" },
    { name: "echoed-secret", body: { error: { message: "Rejected fake-contract-secret\n" + "x".repeat(600) } }, code: "provider_error" },
    { name: "secret-at-limit", text: "x".repeat(280) + "fake-contract-secret", status: 401, code: "provider_error" },
    { name: "oversized-response", text: "x".repeat(65537), code: "response_too_large" }
  ];
  let upstreamCalls = 0;
  const server = createServer((request, response) => {
    upstreamCalls += 1;
    request.resume();
    const fixture = fixtures.find((row) => request.url === `/${row.name}/chat/completions`);
    assert.ok(fixture);
    response.writeHead(fixture.status ?? 200, { "content-type": fixture.name === "html" ? "text/html" : "application/json" });
    response.end("text" in fixture ? fixture.text : JSON.stringify(fixture.body));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const originalOrigin = process.env.LYRICS_CARD_APP_ORIGIN;
  process.env.LYRICS_CARD_APP_ORIGIN = origin;
  try {
    for (const fixture of fixtures) {
      const settings = { baseUrl: `${origin}/${fixture.name}`, model: "test-model", apiKey: "fake-contract-secret" };
      for (const testConnection of [testAIProviderConnection, electronProvider.testProviderConnection]) {
        if (fixture.code) {
          await assert.rejects(testConnection(settings), (error: unknown) => {
            assert.equal(connectionErrorCode(error), fixture.code, fixture.name);
            assert.doesNotMatch(connectionErrorDiagnostic(error), /fake-contract-secret/);
            assert.doesNotMatch(connectionErrorDiagnostic(error), /fake-/);
            assert.ok(connectionErrorDiagnostic(error).length <= 300);
            return true;
          });
        } else {
          assert.equal(await testConnection(settings), true, fixture.name);
        }
      }
      const response = await testConnectionRoute(new Request(`${origin}/api/ai/test-connection`, {
        method: "POST",
        headers: { origin, "x-lyrics-card-request": "1", "content-type": "application/json" },
        body: JSON.stringify({ settings })
      }));
      const result = await response.json();
      assert.equal(response.status, fixture.code ? 502 : 200, `${fixture.name}: route status`);
      if (fixture.code) {
        assert.equal(result.error.code, fixture.code, `${fixture.name}: route code`);
        assert.doesNotMatch(JSON.stringify(result), /fake-contract-secret/);
      } else {
        assert.deepEqual(result, { ok: true });
      }
    }
    const callsBeforeRejections = upstreamCalls;
    for (const headers of [
      { origin: "https://wrong.example", "x-lyrics-card-request": "1", "content-type": "application/json" },
      { origin, "content-type": "application/json" }
    ]) {
      const response = await testConnectionRoute(new Request(`${origin}/api/ai/test-connection`, {
        method: "POST", headers: headers as HeadersInit,
        body: JSON.stringify({ settings: { baseUrl: `${origin}/completion`, model: "test-model", apiKey: "fake-contract-secret" } })
      }));
      assert.equal(response.status, 403);
    }
    assert.equal(upstreamCalls, callsBeforeRejections, "rejected origins/markers never reach the provider");
    console.log(`Connection response contracts passed: ${fixtures.length} fixtures across Electron, TypeScript and Next route`);
  } finally {
    if (originalOrigin === undefined) delete process.env.LYRICS_CARD_APP_ORIGIN;
    else process.env.LYRICS_CARD_APP_ORIGIN = originalOrigin;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
