import assert from "node:assert/strict";
import dns from "node:dns";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import ts from "typescript";
import { POST as translate } from "../app/api/ai/translate/route";
import { testAIProviderConnection } from "../lib/ai/provider-request";
import { createAppRequestHeaders, APP_CANONICAL_ORIGIN_ENV } from "../lib/app-request";

const require = createRequire(import.meta.url);
const provider = require("../electron/provider-response.js");
const stream = require("../electron/ai-stream.js");
const source = ts.createSourceFile("main.js", readFileSync("electron/main.js", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functionNames = ["streamAITranslationInMain", "resolveAIProviderEndpoint", "createAIError"];
const declarations = source.statements.filter((node) => ts.isFunctionDeclaration(node) && functionNames.includes(node.name?.text ?? ""));
assert.equal(declarations.length, functionNames.length);
const bindings = {
  ...provider, ...stream,
  buildProviderChatCompletionsRequestBody: provider.buildChatCompletionsRequestBody,
  resolveProviderChatCompletionsUrl: provider.getChatCompletionsUrl,
  readNormalizedProviderError: provider.readProviderError
};
// Execute the original main-process functions with their real helper modules.
// Electron GUI/IPC is outside this isolated transport regression.
const desktopTranslate = new Function(...Object.keys(bindings),
  `${declarations.map((node) => node.getText(source)).join("\n")}\nreturn streamAITranslationInMain;`
)(...Object.values(bindings));

const fakeKey = "REDIRECT_TEST_FAKE_KEY";
const fakePrompt = "REDIRECT_TEST_SYNTHETIC_LYRICS";
const originalLookup = dns.lookup;
const originalOrigin = process.env[APP_CANONICAL_ORIGIN_ENV];
const appOrigin = "http://127.0.0.1:3210";
const settings = { model: "fixture-model", temperature: 0, apiKey: fakeKey };
const received: { path: string; body: string; authorization?: string }[] = [];
let sourceRequests = 0;
let redirectStatus = 307;
let location = "";
let successful = false;
const sink = createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    received.push({ path: request.url ?? "", body, authorization: request.headers.authorization });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: "fixture translation" } }] }));
  });
});
const server = createServer((request, response) => {
  sourceRequests++;
  if (request.url !== "/chat/completions") received.push({ path: request.url ?? "", body: "unexpected next hop" });
  request.resume();
  if (successful) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: "fixture translation" } }] }));
  } else {
    response.writeHead(redirectStatus, { location });
    response.end();
  }
});

async function listen(target: Server) {
  await new Promise<void>((resolve, reject) => { target.once("error", reject); target.listen(0, "127.0.0.1", resolve); });
  return (target.address() as AddressInfo).port;
}

async function main() {
  const sourcePort = await listen(server);
  const sinkPort = await listen(sink);
  const baseUrl = `http://127.0.0.1:${sourcePort}`;
  // Native fetch still handles redirects; only this reserved fixture hostname
  // is mapped to a local socket, without changing system DNS or using the web.
  dns.lookup = ((hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    if (hostname === "redirect-sink.invalid") {
      if (options.all) callback(null, [{ address: "127.0.0.1", family: 4 }]);
      else callback(null, "127.0.0.1", 4);
      return;
    }
    return originalLookup(hostname, options, callback);
  }) as typeof dns.lookup;
  process.env[APP_CANONICAL_ORIGIN_ENV] = appOrigin;
  try {
    location = `http://redirect-sink.invalid:${sinkPort}/sink`;
    const control = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST", body: fakePrompt, headers: { authorization: `Bearer ${fakeKey}` }
    });
    await control.text();
    assert.equal(received[0]?.body, fakePrompt, "negative control really forwards the body without the policy");
    assert.equal(received[0]?.authorization, undefined, "native cross-origin redirect strips Authorization");
    received.length = 0;

    const paths: [string, () => Promise<unknown>][] = [
      ["Next translation", async () => {
        const headers = createAppRequestHeaders({ "content-type": "application/json" });
        headers.set("origin", appOrigin);
        const response = await translate(new Request(`${appOrigin}/api/ai/translate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ prompt: fakePrompt, settings: { ...settings, baseUrl } })
        }));
        const body = await response.json();
        if (!response.ok) throw new Error(body.error.code);
        return body;
      }],
      ["Electron translation", () => desktopTranslate({
        settings: { ...settings, baseUrl }, apiKey: fakeKey, prompt: fakePrompt,
        signal: new AbortController().signal,
        onStatus() {}, onReasoningDelta() {}, onDelta() {}
      })],
      ["TypeScript connection", () => testAIProviderConnection({ ...settings, baseUrl })],
      ["Electron connection", () => provider.testProviderConnection({ ...settings, baseUrl })]
    ];
    let cases = 0;
    for (const [label, run] of paths) {
      for (redirectStatus of [301, 302, 303, 307, 308]) {
        for (location of [
          `http://redirect-sink.invalid:${sinkPort}/sink`,
          `http://127.0.0.1:${sinkPort}/sink`,
          "/middle", // also a redirect loop/multi-hop: the first hop must stop
          "/chat/completions"
        ]) {
          const before = sourceRequests;
          await assert.rejects(run(), /network/, `${label}: ${redirectStatus} ${location}`);
          assert.equal(sourceRequests, before + 1, `${label}: no relative/multi-hop follow-up`);
          assert.deepEqual(received, [], `${label}: no target request, prompt or credentials`);
          cases++;
        }
      }
      successful = true;
      await run();
      successful = false;
    }
    console.log(`AI provider redirect regressions passed: ${cases} redirect cases and 4 direct loopback successes`);
  } finally {
    dns.lookup = originalLookup;
    if (originalOrigin === undefined) delete process.env[APP_CANONICAL_ORIGIN_ENV];
    else process.env[APP_CANONICAL_ORIGIN_ENV] = originalOrigin;
    for (const target of [server, sink]) {
      target.closeAllConnections();
      await new Promise<void>((resolve) => target.close(() => resolve()));
    }
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
