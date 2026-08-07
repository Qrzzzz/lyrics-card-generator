import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  buildChatCompletionsRequestBody,
  getChatCompletionsUrl,
  readProviderError,
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
  getChatCompletionsUrl: (baseUrl: string) => string;
  readProviderError: (response: Response) => Promise<string>;
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

  assert.equal(
    captureThrownMessage(() => getChatCompletionsUrl("mailto:test")),
    captureThrownMessage(() => electronProvider.getChatCompletionsUrl("mailto:test"))
  );

  console.log(JSON.stringify({ ok: true, aiProviderResponseTests: 11 }, null, 2));
}

void main();

function captureThrownMessage(fn: () => unknown) {
  try {
    fn();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
