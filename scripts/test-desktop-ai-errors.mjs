import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { _electron as electron, chromium } from "playwright";
import { prepareEditorLanguage } from "./editor-language-test-helpers.mjs";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = await mkdtemp(path.join(tmpdir(), "lyrics-card-ai-errors-"));
const reportDirectory = path.join(root, "output", "playwright", "desktop-ai-errors");
const fakeKey = "fake-desktop-regression-secret";
const fixtures = [
  { name: "completion", body: { choices: [{ message: { content: "translated" } }] } },
  { name: "empty-content", body: { choices: [{ message: { content: "" }, finish_reason: "length" }] } },
  { name: "reasoning", body: { choices: [{ message: { content: null, reasoning_content: "thinking" }, finish_reason: "length" }] } },
  { name: "html", text: "<!doctype html><title>Dashboard</title>", code: "invalid_response", copy: "解析" },
  { name: "error-json", body: { error: { message: `DESKTOP_INVALID_MODEL ${fakeKey}` } }, code: "provider_error", copy: "DESKTOP_INVALID_MODEL" },
  { name: "empty", text: "", status: 204, code: "invalid_response", copy: "解析" },
  { name: "unauthorized", body: { error: { message: `DESKTOP_INVALID_KEY ${fakeKey}` } }, status: 401, code: "provider_error", copy: "DESKTOP_INVALID_KEY" }
];
let upstreamCalls = 0;
const sseEvent = (data) => `data: ${JSON.stringify(data)}\n\n`;
const sseContent = sseEvent({ choices: [{ delta: { content: "translated" } }] });
const sseStop = sseEvent({ choices: [{ finish_reason: "stop" }] });
const sseError = sseEvent({ error: { code: "cancelled", message: fakeKey } });
const sseFixtures = [
  { name: "sse-error-eof", tail: sseError, code: "provider_error" },
  { name: "sse-error-done", tail: sseError + "data: [DONE]\n\n", code: "provider_error" },
  { name: "sse-error-content", tail: sseError + sseContent + sseStop + "data: [DONE]\n\n", code: "provider_error" },
  { name: "sse-error-terminal", tail: sseEvent({ choices: [{ finish_reason: "error" }] }) + "data: [DONE]\n\n", code: "provider_error" },
  { name: "sse-incomplete", tail: "", code: "stream_incomplete" },
  { name: "sse-stop", tail: sseStop },
  { name: "sse-done", tail: sseStop + "data: [DONE]\n\n" }
];
const server = createServer((request, response) => {
  upstreamCalls += 1;
  request.resume();
  const streamFixture = sseFixtures.find((row) => request.url === `/${row.name}/chat/completions`);
  if (streamFixture) {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(sseContent + streamFixture.tail);
    return;
  }
  const fixture = fixtures.find((row) => request.url === `/${row.name}/chat/completions`);
  if (!fixture) { response.writeHead(404); response.end(); return; }
  response.writeHead(fixture.status ?? 200, { "content-type": fixture.name === "html" ? "text/html" : "application/json" });
  response.end("text" in fixture ? fixture.text : JSON.stringify(fixture.body));
});
let electronApp;
let browser;
let page;
try {
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(path.join(profile, "app-preferences.json"), JSON.stringify({ schemaVersion: 2, revision: 1, updatedAt: 1, locale: "zh", userSettings: {} }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const environment = { ...process.env, LYRICS_CARD_TEST_USER_DATA: profile };
  delete environment.ELECTRON_RUN_AS_NODE;
  electronApp = await electron.launch({
    executablePath: path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe"),
    env: environment,
    timeout: 90_000
  });
  page = await electronApp.firstWindow({ timeout: 90_000 });
  page.setDefaultTimeout(20_000);
  await prepareEditorLanguage(page, "zh");
  // Bundle the unmodified product client to exercise translation over the real
  // preload/IPC/main chain, without submitting a user's document to a provider.
  const clientBundle = await build({
    stdin: { contents: 'export { streamAITranslation, saveAISettings } from "./lib/ai/client"; export { normalizeAIErrorMessage } from "./components/editor/utils/normalizeAIErrorMessage";', resolveDir: root, loader: "ts" },
    bundle: true, write: false, platform: "browser", format: "iife", globalName: "__aiRegressionClient"
  });
  await page.addScriptTag({ content: clientBundle.outputFiles[0].text });
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await page.getByTestId("settings-tab-ai").click();
  await page.getByTestId("ai-open-api").click();
  const panel = page.getByTestId("ai-connection-test-panel");
  const testButton = page.getByTestId("test-ai-connection");
  const baseUrl = page.getByTestId("ai-base-url-input");
  const model = page.getByTestId("ai-model-input");

  async function expectConnectionError(text) {
    await testButton.click();
    await page.waitForFunction((expected) => document.querySelector('[data-testid="ai-connection-test-panel"] [role="alert"]')?.textContent?.includes(expected), text);
    const message = await panel.getByRole("alert").textContent();
    assert.ok(message.includes(text));
    assert.ok(!message.includes(fakeKey));
    assert.equal(await panel.getByRole("status").count(), 0);
    return message;
  }

  async function translate() {
    return page.evaluate(async () => {
      try {
        return { content: await window.__aiRegressionClient.streamAITranslation({ prompt: "fixture only", reasoning: false }) };
      } catch (error) {
        return { code: error.code, diagnostic: error.diagnostic, message: window.__aiRegressionClient.normalizeAIErrorMessage(error, "zh") };
      }
    });
  }

  await baseUrl.fill(`${origin}/completion`);
  await expectConnectionError("配置 API Key");
  assert.equal((await translate()).code, "missing_api_key");
  await page.getByTestId("ai-api-key-input").fill(fakeKey);
  await model.fill("");
  await expectConnectionError("配置模型");
  assert.equal((await translate()).code, "missing_model");
  assert.equal(upstreamCalls, 0, "missing settings fail before any upstream request");
  await model.fill("fixture-model");

  for (const fixture of fixtures) {
    await baseUrl.fill(`${origin}/${fixture.name}`);
    if (fixture.code) {
      await expectConnectionError(fixture.copy);
    } else {
      await testButton.click();
      await panel.getByRole("status").waitFor({ state: "visible" });
      assert.equal(await panel.getByRole("alert").count(), 0);
    }
    const route = await page.evaluate(async (settings) => {
      const response = await fetch("/api/ai/test-connection", {
        method: "POST", headers: { "content-type": "application/json", "x-lyrics-card-request": "1" }, body: JSON.stringify({ settings })
      });
      return { status: response.status, body: await response.json() };
    }, { baseUrl: `${origin}/${fixture.name}`, model: "fixture-model", apiKey: fakeKey });
    assert.equal(route.status, fixture.code ? 502 : 200, `${fixture.name}: packaged Next route`);
    if (fixture.code) assert.equal(route.body.error.code, fixture.code);
    else assert.deepEqual(route.body, { ok: true });
    assert.ok(!JSON.stringify(route).includes(fakeKey));
    if (fixture.name === "completion") assert.equal((await translate()).content, "translated");
    if (fixture.name === "unauthorized") {
      const result = await translate();
      assert.equal(result.code, "provider_error");
      assert.match(result.message, /DESKTOP_INVALID_KEY/);
      assert.ok(!JSON.stringify(result).includes(fakeKey));
    }
  }
  await panel.screenshot({ path: path.join(reportDirectory, "provider-error.png") });
  browser = await chromium.launch({ headless: true });
  for (const fixture of sseFixtures) {
    const settings = { baseUrl: `${origin}/${fixture.name}`, model: "fixture-model", apiKey: fakeKey };
    await page.evaluate((value) => window.lyricsCardDesktop.saveAISettings(value), settings);
    const desktopResult = await translate();
    // A separate page without the preload API exercises the browser client and
    // packaged Next translation proxy against the same local provider fixtures.
    const browserPage = await browser.newPage();
    await browserPage.goto(page.url());
    await browserPage.addScriptTag({ content: clientBundle.outputFiles[0].text });
    const browserResult = await browserPage.evaluate(async (value) => {
      if (window.lyricsCardDesktop) throw new Error("Browser fixture unexpectedly has desktop IPC");
      await window.__aiRegressionClient.saveAISettings(value);
      try {
        return { content: await window.__aiRegressionClient.streamAITranslation({ prompt: "fixture only", reasoning: false }) };
      } catch (error) { return { code: error.code, message: error.message }; }
    }, settings);
    await browserPage.close();
    for (const result of [desktopResult, browserResult]) {
      assert.equal(result.code, fixture.code, fixture.name);
      if (!fixture.code) assert.equal(result.content, "translated");
      assert.ok(!JSON.stringify(result).includes(fakeKey));
    }
  }
  console.log("SSE terminal cases passed through packaged desktop IPC and browser/Next client");
  // Inject a decryption failure only into this disposable Electron process.
  // This is a recovery-path fixture, not evidence of damaged system storage.
  const beforeDecryptFailure = upstreamCalls;
  await electronApp.evaluate(({ safeStorage }) => {
    globalThis.__aiOriginalDecrypt = safeStorage.decryptString;
    safeStorage.decryptString = () => { throw new Error("fixture decryption failure"); };
  });
  try {
    await expectConnectionError("无法读取");
    assert.equal((await translate()).code, "api_key_read_failed");
    assert.equal(upstreamCalls, beforeDecryptFailure);
  } finally {
    await electronApp.evaluate(({ safeStorage }) => {
      safeStorage.decryptString = globalThis.__aiOriginalDecrypt;
      delete globalThis.__aiOriginalDecrypt;
    });
  }
  await baseUrl.fill("http://attacker.example/v1");
  await expectConnectionError("HTTPS");
  assert.equal(upstreamCalls, beforeDecryptFailure, "unsafe URLs fail before fetch");
  console.log("Packaged desktop AI regression passed: settings UI, real preload/IPC/main, translation errors, decryption-failure fixture, and seven packaged Next route responses");
} finally {
  await browser?.close();
  await page?.evaluate(() => window.lyricsCardDesktopBridge?.confirmWindowClose()).catch(() => undefined);
  await closeElectronApplication(electronApp, { label: "desktop-ai-errors" });
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  const resolvedProfile = path.resolve(profile);
  assert.ok(resolvedProfile.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(resolvedProfile).startsWith("lyrics-card-ai-errors-"));
  await rm(resolvedProfile, { recursive: true, force: true });
}
