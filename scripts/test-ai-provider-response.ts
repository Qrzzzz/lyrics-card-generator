import assert from "node:assert/strict";
import {
  getChatCompletionMessage,
  getProviderErrorMessage,
  readProviderResponseBody
} from "../lib/ai/provider-response";

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
  assert.equal(getProviderErrorMessage(jsonError, 401), "AI request failed: bad key");

  const textError = await read("provider overloaded", {
    status: 503,
    headers: { "content-type": "text/plain" }
  });
  assert.equal(getProviderErrorMessage(textError, 503), "AI request failed: provider overloaded");

  const malformedJson = await read("<html>nope</html>", {
    status: 502,
    headers: { "content-type": "application/json" }
  });
  assert.equal(malformedJson.kind, "text");
  assert.equal(getProviderErrorMessage(malformedJson, 502), "AI request failed: <html>nope</html>");

  const empty = await read("", { status: 500 });
  assert.equal(empty.kind, "empty");
  assert.equal(getProviderErrorMessage(empty, 500), "AI request failed (HTTP 500).");

  console.log(JSON.stringify({ ok: true, aiProviderResponseTests: 5 }, null, 2));
}

void main();
