import assert from "node:assert/strict";
import { prepareEditorLanguage } from "./editor-language-test-helpers.mjs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

const executablePath = process.env.LYRICS_CARD_TEST_EXECUTABLE || path.resolve("release/win-unpacked/Lyrics Card Generator.exe");
const profile = await mkdtemp(path.join(tmpdir(), "lyrics-remote-transfer-ui-"));
const report = path.resolve("playwright-report/desktop");
await mkdir(report, { recursive: true });
const initialLyrics = "\n  Original line  \n\nSecond line🙂\n";
const processedLyrics = "\n  Processed line  \n\nFinal line\n";
const translation = "\n  翻译第一行  \n\n最终一行\n";
const counts = { search: 0, resolve: 0, cover: 0 };
const errors = [];
let app;
let page;
let coverFails = false;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function launch(first = false) {
  app = await electron.launch({ executablePath, env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: profile }, timeout: 60_000 });
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  page = await app.firstWindow({ timeout: 60_000 });
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(15_000);
  await page.route("**/api/search-song", async (route) => {
    counts.search++;
    const keyword = route.request().postDataJSON().keyword;
    const id = keyword === "Remote A" ? "10001" : "10002";
    await route.fulfill({ json: { ok: true, data: [{ source: "netease", id, title: keyword, artist: "Transfer Artist",
      artists: ["Transfer Artist"], album: "Test album", durationMs: 120000, pageUrl: `https://music.163.com/song?id=${id}` }] } });
  });
  await page.route("**/api/resolve-searched-song", async (route) => {
    counts.resolve++;
    const id = route.request().postDataJSON().id;
    await route.fulfill({ json: { ok: true, data: { song: { title: id === "10001" ? "Remote A" : "Remote B",
      artist: "Transfer Artist", album: "Test album", source: "netease", originalUrl: `https://music.163.com/song?id=${id}` },
    lyrics: initialLyrics, lyricSource: "netease" } } });
  });
  await page.route("**/api/parse-song", async (route) => {
    counts.cover++;
    const url = route.request().postDataJSON().url;
    await route.fulfill({ json: coverFails ? { ok: false, error: "cover unavailable" } : { ok: true, data: {
      title: "Fresh remote title", artist: "Remote artist", source: "netease", originalUrl: url,
      lyrics: "REMOTE LYRICS MUST NOT REPLACE THE SNAPSHOT", coverUrl: "https://covers.example/refresh.png"
    } } });
  });
  await page.route("**/api/image-proxy**", (route) => route.fulfill({ contentType: "image/png", body: png }));
  await page.route("https://covers.example/**", (route) => route.fulfill({ contentType: "image/png", body: png }));
  if (first) {
    await prepareEditorLanguage(page, "en");
  }
  await page.locator('[data-testid="editor-surface"] [data-testid="history-button"]').waitFor({ state: "visible", timeout: 30_000 });
}
async function openHistory() {
  await page.locator('[data-testid="editor-surface"] [data-testid="history-button"]').click();
  await page.getByTestId("history-surface").waitFor({ state: "visible" });
  await page.locator('[data-testid="history-surface"] [data-history-kind]').first().waitFor();
}
async function closeHistory() {
  await page.getByTestId("history-close-button").click();
  await page.getByTestId("history-surface").waitFor({ state: "hidden" });
}
async function records() {
  return page.evaluate(async () => (await window.lyricsCardDesktop.listImportHistory({ offset: 0, limit: 50 })).records);
}
async function search(keyword, total) {
  await page.getByTestId("song-search-primary").getByRole("combobox").fill(keyword);
  await page.getByTestId("song-search-listbox").getByRole("option").first().click();
  // waitForFunction treats an async predicate's Promise as truthy before the
  // IPC result arrives. Poll on the Node side and await the actual count.
  await expect.poll(() => page.evaluate(async () => (await window.lyricsCardDesktop.getImportHistoryStats()).total),
    { timeout: 15_000 }).toBe(total);
}
async function copied(selector) {
  await page.getByTestId(selector).click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="history-close-button"]').disabled);
  return app.evaluate(({ clipboard }) => clipboard.readText());
}
async function paste(text) {
  await page.getByTestId("history-paste").click();
  await page.getByTestId("history-json-input").fill(text);
  await page.getByTestId("history-import-preview-button").click();
}
async function confirmImport() {
  await page.getByTestId("history-import-confirm").click();
  await page.getByTestId("history-transfer-dialog").waitFor({ state: "hidden" });
}
async function assertLyrics(expected, translated = translation) {
  await page.locator('[data-step-id="lyrics"]').click();
  await page.getByTestId("lyrics-editor-original").waitFor();
  assert.equal(await page.getByTestId("lyrics-editor-original").inputValue(), expected);
  assert.equal(await page.getByTestId("lyrics-editor-translation").inputValue(), translated);
}

try {
  await launch(true);
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await page.getByTestId("settings-tab-general").click();
  await page.getByTestId("import-history-limit").selectOption("unlimited");
  await page.getByTestId("settings-close-button").click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });
  await search("Remote A", 1);
  const a = (await records())[0];
  await openHistory();
  const originalJson = await copied(`history-copy-${a.id}`);
  assert.equal(JSON.parse(originalJson).records[0].lyricsSnapshot.lyrics, initialLyrics);
  assert.ok(!originalJson.includes("CoverUrl"));
  await closeHistory();
  await page.getByTestId("stepper-next-button").click();
  await page.getByTestId("lyrics-editor-original").fill(processedLyrics);
  await page.getByTestId("lyrics-sidebar-tab-translation").click();
  await page.getByRole("switch", { name: "Enable Translation", exact: true }).click();
  await page.getByTestId("lyrics-editor-translation").fill(translation);
  await openHistory();
  const editedJson = await copied(`history-copy-${a.id}`);
  const edited = JSON.parse(editedJson).records[0].lyricsSnapshot;
  assert.equal(edited.lyrics, processedLyrics);
  assert.equal(edited.translationText, translation);
  assert.equal(edited.translationEnabled, true);
  await closeHistory();
  await page.getByTestId("stepper-back-button").click();
  await search("Remote B", 2);
  await openHistory();
  await page.getByTestId("history-search").fill("Remote B");
  const allJson = await copied("history-copy-all");
  assert.equal(JSON.parse(allJson).records.length, 2, "copy all ignores the active filter");
  await page.getByTestId("history-search").fill("");
  const countsBeforePaste = { ...counts };
  await paste(allJson);
  await page.getByTestId("history-import-preview").waitFor();
  assert.match(await page.getByTestId("history-import-preview").innerText(), /Add 0.*Duplicates 2/s);
  await page.screenshot({ path: path.join(report, "v627-history-import-dark.png") });
  const accessibility = await new AxeBuilder({ page }).setLegacyMode().include('[data-testid="history-transfer-dialog"]').analyze();
  assert.deepEqual(accessibility.violations.filter((item) => item.impact === "serious" || item.impact === "critical"), []);
  await confirmImport();
  assert.equal((await records()).length, 2);
  assert.deepEqual(counts, countsBeforePaste, "batch import does not fetch song links or covers");

  await paste("{invalid json");
  await page.getByTestId("history-transfer-dialog").getByRole("alert").waitFor();
  assert.equal((await records()).length, 2);
  await page.keyboard.press("Escape");
  await page.getByTestId("history-transfer-dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "history-paste");
  assert.equal(await page.getByTestId("history-surface").getAttribute("data-surface-state"), "open");

  await paste(originalJson);
  await page.getByTestId("history-import-preview").waitFor();
  await page.evaluate((id) => window.lyricsCardDesktop.commitImportHistoryReplay(id), a.id);
  await page.getByTestId("history-import-confirm").click();
  await page.getByTestId("history-transfer-dialog").getByRole("alert").waitFor();
  assert.match(await page.getByTestId("history-transfer-dialog").innerText(), /changed.*Preview again/s);
  assert.equal((await records()).length, 2);
  await page.getByTestId("history-import-preview-button").click();
  await page.getByTestId("history-import-preview").waitFor();
  await confirmImport();
  assert.equal((await records()).length, 3, "a different snapshot of the same song is a separate history item");

  const beforeCover = counts.cover;
  await page.getByTestId(`history-replay-${a.id}`).click();
  await page.getByTestId("history-surface").waitFor({ state: "hidden" });
  assert.equal(counts.cover, beforeCover, "full draft resume needs no remote reparse");
  await assertLyrics(processedLyrics);
  await page.getByTestId("stepper-back-button").click();
  assert.equal(counts.cover, beforeCover, "returning to step one does not reparse a restored snapshot");
  await page.getByRole("button", { name: "Clear content", exact: true }).click();
  await openHistory();
  assert.equal(JSON.parse(await copied(`history-copy-${a.id}`)).records[0].lyricsSnapshot.lyrics, processedLyrics,
    "clearing the editor preserves the history snapshot");
  coverFails = true;
  await page.getByTestId(`history-replay-${a.id}`).click();
  await page.getByTestId("history-surface").waitFor({ state: "hidden" });
  await assertLyrics(processedLyrics);
  const finalLyrics = processedLyrics + "saved before close";
  await page.getByTestId("lyrics-editor-original").fill(finalLyrics);
  await closeElectronApplication(app, { label: "remote-history-transfer" });
  app = undefined;
  const disk = JSON.parse(await readFile(path.join(profile, "app-data/import-history.json"), "utf8"));
  assert.equal(disk.records.find((item) => item.id === a.id).lyricsSnapshot.lyrics, finalLyrics);
  await launch();
  await openHistory();
  assert.equal(JSON.parse(await copied(`history-copy-${a.id}`)).records[0].lyricsSnapshot.lyrics, finalLyrics);
  await page.screenshot({ path: path.join(report, "v627-history-records.png") });
  await closeHistory();
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await page.getByTestId("settings-tab-appearance").click();
  await page.locator('[data-settings-panel="appearance"]:not([hidden]) [data-segment-value="light"]').click();
  await page.getByTestId("settings-close-button").click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(960, 720));
  await openHistory();
  await paste(originalJson);
  await page.getByTestId("history-import-preview").waitFor();
  const geometry = await page.getByRole("dialog").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { width: node.clientWidth, scrollWidth: node.scrollWidth, top: rect.top, bottom: rect.bottom,
      viewportHeight: window.innerHeight, background: getComputedStyle(node).backgroundColor };
  });
  assert.ok(geometry.scrollWidth <= geometry.width + 1 && geometry.top >= 0 && geometry.bottom <= geometry.viewportHeight);
  assert.notEqual(geometry.background, "rgba(0, 0, 0, 0)", "the portal inherits a visible themed panel");
  await page.screenshot({ path: path.join(report, "v627-history-import-light-compact.png") });
  const lightAccessibility = await new AxeBuilder({ page }).setLegacyMode().include('[data-testid="history-transfer-dialog"]').analyze();
  assert.deepEqual(lightAccessibility.violations.filter((item) => item.impact === "serious" || item.impact === "critical"), []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, remoteHistoryDesktop: ["untouched lyrics", "step-two edits and translations", "filtered copy-all", "paste validation and deduplication", "stale preview", "same-song variants", "offline full-draft resume", "shutdown and restart", "dialog focus and accessibility"], counts }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: path.join(report, "v627-history-failure.png") }).catch(() => {});
  throw error;
} finally {
  await closeElectronApplication(app, { label: "remote-history-transfer" });
  await rm(profile, { recursive: true, force: true });
}
