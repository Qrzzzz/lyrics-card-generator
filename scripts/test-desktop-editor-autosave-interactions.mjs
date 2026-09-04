import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import net from "node:net";
import path from "node:path";
import { _electron as electron } from "playwright";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

const executablePath = process.env.LYRICS_CARD_TEST_EXECUTABLE || path.resolve("release/win-unpacked/Lyrics Card Generator.exe");
const profile = await mkdtemp(path.join(tmpdir(), "lyrics-editor-autosave-"));
const report = path.resolve("output/playwright", `autosave-${Date.now()}`);
await mkdir(report, { recursive: true });
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const errors = [];
const inspect = process.argv.includes("--inspect");
let app;
let page;
let port;
const historyPath = path.join(profile, "app-data/import-history.json");

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const result = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return result;
}
async function launch(first = false) {
  port = await availablePort();
  app = await electron.launch({ executablePath, args: [`--remote-debugging-port=${port}`],
    env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: profile }, timeout: 60_000 });
  await app.evaluate(({ dialog }) => {
    globalThis.__autosaveDialogs = [];
    dialog.showMessageBox = async (_window, options) => {
      globalThis.__autosaveDialogs.push(options);
      return { response: 0, checkboxChecked: false };
    };
  });
  page = await app.firstWindow({ timeout: 60_000 });
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/search-song", async (route) => {
    const keyword = route.request().postDataJSON().keyword;
    await route.fulfill({ json: { ok: true, data: [{ source: "netease", id: "81234", title: keyword, artist: "Autosave Artist",
      artists: ["Autosave Artist"], album: "Test Album", durationMs: 120000, pageUrl: "https://music.163.com/song?id=81234" }] } });
  });
  await page.route("**/api/resolve-searched-song", (route) => route.fulfill({ json: { ok: true, data: {
    song: { source: "netease", title: "Autosave Song", artist: "Autosave Artist", album: "Test Album", originalUrl: "https://music.163.com/song?id=81234" },
    lyrics: "Original first line\nOriginal second line", lyricSource: "netease" } } }));
  await page.route("**/api/parse-song", (route) => route.fulfill({ json: { ok: false, error: "offline fixture" } }));
  await page.route("**/api/parse-local-audio", (route) => route.fulfill({ json: { ok: true, status: "success", data: {
    source: "unknown", title: "Local Draft", artist: "Local Artist", originalUrl: "", lyrics: "embedded lyrics", coverUrl: png
  } } }));
  if (first) {
    await page.getByTestId("first-launch-language-dialog").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator('[data-testid="first-launch-language"][data-locale="en"]').click();
  }
  await page.getByTestId("autosave-status").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="editor-surface"]')?.inert, null, { timeout: 30_000 });
  assert.equal(await page.getByTestId("manual-save-button").count(), 0);
}
async function disk() { return JSON.parse(await readFile(historyPath, "utf8")); }
async function search() {
  await page.getByTestId("song-search-primary").getByRole("combobox").fill("Autosave Song");
  await page.getByTestId("song-search-listbox").getByRole("option").first().click();
  await expect.poll(() => page.evaluate(async () => (await window.lyricsCardDesktop.getImportHistoryStats()).total),
    { timeout: 15_000 }).toBeGreaterThan(0);
}
async function saved() {
  await page.waitForFunction(() => document.querySelector('[data-testid="autosave-status"]')?.getAttribute("data-save-state") === "saved");
}
async function closeNormally() {
  const child = app.process();
  const exited = new Promise((resolve) => child.once("exit", resolve));
  await page.evaluate(() => window.lyricsCardDesktop.closeWindow());
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("Normal close failed")), 12_000))]);
  app = undefined;
}
async function openHistory() {
  await page.locator('[data-testid="editor-surface"] [data-testid="history-button"]').click();
  await page.getByTestId("history-surface").waitFor({ state: "visible" });
}

try {
  await launch(true);
  await search();
  await page.getByTestId("stepper-next-button").click();
  const original = page.getByTestId("lyrics-editor-original");
  await original.fill("first unsaved edit");
  await page.waitForTimeout(2000);
  assert.ok(!(await disk()).records.some((record) => record.editorDraft?.content.lyrics === "first unsaved edit"));
  const finalText = "\n  Latest authored lyrics\n\n尾行🙂\n";
  await original.fill(finalText);
  await page.waitForTimeout(4000);
  assert.ok(!(await disk()).records.some((record) => record.editorDraft?.content.lyrics === finalText), "a later input restarts the full 5s interval");
  await saved();
  let document = await disk();
  const remoteId = document.activeDraftId;
  assert.equal(document.records.find((record) => record.id === remoteId).editorDraft.content.lyrics, finalText);
  await page.getByTestId("lyrics-sidebar-tab-translation").click();
  await page.getByRole("switch", { name: "Enable Translation", exact: true }).click();
  await page.getByTestId("lyrics-editor-translation").fill("  saved translation\n");
  await closeNormally();
  assert.equal((await disk()).records.find((record) => record.id === remoteId).editorDraft.content.translationText, "  saved translation\n");
  await launch();
  assert.equal(await page.getByTestId("lyrics-editor-original").inputValue(), finalText);
  assert.equal(await page.getByTestId("lyrics-editor-translation").inputValue(), "  saved translation\n");
  console.log("PASS: 5s debounce, latest edit, immediate close, automatic restart, translation");

  await page.locator('[data-step-id="layout"]').click();
  const fontSlider = page.getByRole("slider", { name: "Font Size", exact: true });
  await fontSlider.fill("68");
  await saved();
  const savedStyle = (await disk()).records.find((record) => record.id === remoteId).editorDraft.style;
  await page.screenshot({ path: path.join(report, "autosave-desktop.png") });
  for (const size of [{ width: 1280, height: 900 }, { width: 1000, height: 700 }]) {
    await app.evaluate(({ BrowserWindow }, next) => BrowserWindow.getAllWindows()[0].setContentSize(next.width, next.height), size);
    await page.waitForFunction((width) => Math.abs(innerWidth - width) < 2, size.width);
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-testid="autosave-status"]').getBoundingClientRect();
      return Math.abs(status.x + status.width / 2 - innerWidth / 2) < 2;
    });
    const geometry = await page.evaluate(() => {
      const status = document.querySelector('[data-testid="autosave-status"]').getBoundingClientRect();
      const brand = document.querySelector('.desktop-titlebar__brand').getBoundingClientRect();
      return { middle: status.x + status.width / 2, window: innerWidth / 2, left: status.left, brandRight: brand.right };
    });
    assert.ok(Math.abs(geometry.middle - geometry.window) < 2);
    assert.ok(geometry.left >= geometry.brandRight, "status must not overlap the app title");
  }
  await closeNormally();
  await launch();
  assert.equal(await page.getByRole("slider", { name: "Font Size", exact: true }).inputValue(), "68");
  assert.deepEqual((await disk()).records.find((record) => record.id === remoteId).editorDraft.style, savedStyle);
  await page.locator('[data-step-id="link"]').click();
  const audio = path.join(profile, "fixture.mp3");
  await writeFile(audio, Buffer.from("ID3 AUTOSAVE TEST FIXTURE"));
  await page.locator('input[type="file"][accept*=".mp3"]').setInputFiles(audio);
  await page.waitForFunction(() => document.querySelector('[data-testid="song-info-summary"]')?.textContent?.includes("Local Draft"));
  await page.getByTestId("stepper-next-button").click();
  await page.getByTestId("lyrics-editor-original").fill("modified local lyrics");
  await closeNormally();
  document = await disk();
  const localId = document.activeDraftId;
  assert.ok(document.records.find((record) => record.id === localId).editorDraft.coverAsset);
  await rm(audio);
  await launch();
  assert.equal(await page.getByTestId("lyrics-editor-original").inputValue(), "modified local lyrics");
  assert.ok((await page.evaluate(() => document.querySelector('img[src^="blob:"]')?.getAttribute("src")))?.startsWith("blob:"));
  console.log("PASS: style, titlebar center/minimum-size, local lyrics and cover after source removal");

  await page.locator('[data-step-id="link"]').click();
  await page.getByTestId("song-info-toggle").click();
  await page.getByTestId("song-info-editor").getByLabel("Song Title", { exact: true }).fill("unfinished song form");
  await closeNormally();
  await launch();
  assert.equal(await page.getByTestId("song-info-editor").getByLabel("Song Title", { exact: true }).inputValue(), "unfinished song form");
  await page.getByTestId("song-info-save").click();
  await page.locator('[data-step-id="lyrics"]').click();
  console.log("PASS: unsubmitted song-info form survives immediate close and restart");

  await page.getByTestId("lyrics-editor-original").fill("durable before forced exit");
  await saved();
  const pid = app.process().pid;
  await promisify(execFile)("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
  app = undefined;
  await launch();
  assert.equal(await page.getByTestId("lyrics-editor-original").inputValue(), "durable before forced exit");

  await app.evaluate((_electron, target) => {
    const fs = process.getBuiltinModule("fs/promises");
    globalThis.__autosaveOriginalWrite = fs.writeFile;
    fs.writeFile = async (file, ...rest) => {
      if (String(file).startsWith(target + ".")) throw Object.assign(new Error("injected disk full"), { code: "ENOSPC" });
      return globalThis.__autosaveOriginalWrite(file, ...rest);
    };
  }, historyPath);
  await page.getByTestId("lyrics-editor-original").fill("recover after write failure");
  await page.waitForFunction(() => document.querySelector('[data-testid="autosave-status"]').dataset.saveState === "error");
  assert.equal((await disk()).records.find((record) => record.id === localId).editorDraft.content.lyrics, "durable before forced exit");
  await page.evaluate(() => window.lyricsCardDesktop.closeWindow());
  await app.evaluate(async () => {
    const deadline = Date.now() + 8000;
    while (!globalThis.__autosaveDialogs.some((item) => item.type === "error")) {
      if (Date.now() > deadline) throw new Error("Missing close failure notification");
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  });
  await page.waitForFunction(() => !document.body.inert);
  assert.equal(page.isClosed(), false, "failed persistence must refuse normal close");
  await app.evaluate(() => { process.getBuiltinModule("fs/promises").writeFile = globalThis.__autosaveOriginalWrite; });
  await page.getByTestId("autosave-status").getByRole("button").click();
  await saved();
  assert.equal((await disk()).records.find((record) => record.id === localId).editorDraft.content.lyrics, "recover after write failure");
  console.log("PASS: disk-write error, refusal to discard on close, visible retry and recovery");
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await page.getByTestId("settings-tab-general").click();
  await page.getByTestId("import-history-limit").selectOption("none");
  await page.getByTestId("settings-close-button").click();
  await page.getByTestId("lyrics-editor-original").fill("edited while auto-save is disabled");
  await page.waitForTimeout(5500);
  assert.equal((await disk()).records.find((record) => record.id === localId).editorDraft.content.lyrics, "recover after write failure");
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await page.getByTestId("settings-tab-general").click();
  await page.getByTestId("import-history-limit").selectOption("unlimited");
  await page.getByTestId("settings-close-button").click();
  await saved();
  assert.equal((await disk()).records.find((record) => record.id === localId).editorDraft.content.lyrics, "edited while auto-save is disabled");
  console.log("PASS: disabling/re-enabling auto-save preserves existing drafts and saves the latest edit");
  await openHistory();
  await page.getByTestId(`history-replay-${remoteId}`).click();
  await page.getByTestId("history-surface").waitFor({ state: "hidden" });
  // Remote draft restores the saved text/style without contacting the unavailable provider.
  await page.locator('[data-step-id="lyrics"]').click();
  assert.equal(await page.getByTestId("lyrics-editor-original").inputValue(), finalText);
  await openHistory();
  const accessibility = await new AxeBuilder({ page }).setLegacyMode().include('[data-testid="history-surface"]').analyze();
  assert.deepEqual(accessibility.violations.filter((item) => item.impact === "serious" || item.impact === "critical"), []);
  await page.getByTestId(`history-remove-${remoteId}`).click();
  await page.getByTestId("history-close-button").click();
  await page.getByTestId("lyrics-editor-original").fill("must not resurrect removed history");
  await page.waitForTimeout(5500);
  assert.ok(!(await disk()).records.some((record) => record.id === remoteId));
  console.log("PASS: forced-exit recovery, offline history resume, deletion, accessibility");

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, report, profile, cdp: `http://127.0.0.1:${port}` }));
  if (inspect) {
    console.log("INSPECT_READY");
    await new Promise((resolve) => page.once("close", resolve));
  }
} catch (error) {
  console.log("FAILURE", error instanceof Error ? error.stack : String(error));
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(report, "failure.png") }).catch(() => undefined);
    console.error("PAGE", (await page.locator("body").innerText()).slice(0, 5000));
  }
  throw error;
} finally {
  if (app) await closeElectronApplication(app, { label: "editor-autosave" });
  assert.equal(path.dirname(profile), tmpdir());
  await rm(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
}
