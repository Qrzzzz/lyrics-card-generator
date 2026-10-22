import { selectChoiceValue } from "./choice-test-helpers.mjs";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { expect } from "@playwright/test";
import sharp from "sharp";
import { prepareEditorLanguage } from "./editor-language-test-helpers.mjs";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const userData = await mkdtemp(path.join(tmpdir(), "lyrics-card-output-"));
const downloads = path.join(userData, "downloads");
await mkdir(downloads);
await writeFile(path.join(downloads, "blocked-parent"), "A file cannot be a download directory.");
let app;
try {
  app = await electron.launch({
    executablePath: process.env.LYRICS_CARD_TEST_EXECUTABLE || path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe"),
    env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: userData }, timeout: 60_000
  });
  const page = await app.firstWindow({ timeout: 60_000 });
  await app.evaluate(({ BrowserWindow }, directory) => {
    globalThis.__imageOutputDownloads = [];
    globalThis.__imageOutputAttempt = 0;
    BrowserWindow.getAllWindows()[0].webContents.session.on("will-download", (_event, item) => {
      const file = globalThis.__failNextImageDownload
        ? `${directory}/blocked-parent/card.png`
        : `${directory}/${++globalThis.__imageOutputAttempt}-${item.getFilename().replace(/^.*[\\/]/, "")}`;
      globalThis.__failNextImageDownload = false;
      item.setSavePath(file);
      item.once("done", (_event, state) => globalThis.__imageOutputDownloads.push({ file, state, savePath: item.getSavePath() }));
    });
  }, downloads);
  await prepareEditorLanguage(page, "zh");
  await page.locator('button[data-step-id="export"]').click();
  const panel = page.locator('[data-testid="export-settings-panel"][data-active="true"]');
  const button = panel.getByTestId("complete-export-button");
  const results = [];
  for (const format of ["png", "webp", "jpg"]) {
    await selectChoiceValue(page, format, panel);
    await selectChoiceValue(page, "low", panel);
    await expect(button).toBeEnabled({ timeout: 15_000 });
    const size = await page.locator('[data-export-card-host] [data-export-card="true"]').evaluate((node) => ({ width: Math.round(node.getBoundingClientRect().width), height: Math.round(node.getBoundingClientRect().height) }));
    await button.click();
    await expect.poll(() => app.evaluate(() => globalThis.__imageOutputDownloads.length), { timeout: 30_000 }).toBe(results.length + 1);
    const download = await app.evaluate(() => globalThis.__imageOutputDownloads.at(-1));
    assert.equal(download.state, "completed");
    assert.ok(download.file.endsWith(`.${format}`));
    const bytes = await readFile(download.file);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, format === "jpg" ? "jpeg" : format);
    assert.equal(metadata.width, size.width);
    assert.equal(metadata.height, size.height);
    await expect(page.locator("[data-export-snapshot-id]")).toHaveCount(0);
    results.push({ format, width: metadata.width, height: metadata.height, bytes: bytes.length });
  }
  const originalText = await page.locator('[data-export-card-host]').innerText();
  await app.evaluate(() => { globalThis.__failNextImageDownload = true; });
  await button.click();
  await expect.poll(() => app.evaluate(() => globalThis.__imageOutputDownloads.length), { timeout: 30_000 }).toBe(4);
  assert.equal((await app.evaluate(() => globalThis.__imageOutputDownloads.at(-1))).state, "interrupted");
  await expect(panel.getByTestId("output-failure")).toBeVisible();
  await page.waitForTimeout(5500);
  await expect(panel.getByTestId("retry-image-output")).toBeVisible();
  await panel.getByTestId("retry-image-output").click();
  await expect.poll(() => app.evaluate(() => globalThis.__imageOutputDownloads.length), { timeout: 30_000 }).toBe(5);
  const retriedDownload = await app.evaluate(() => globalThis.__imageOutputDownloads.at(-1));
  assert.equal(retriedDownload.state, "completed", JSON.stringify(await app.evaluate(() => globalThis.__imageOutputDownloads)));
  await expect(panel.getByTestId("output-failure")).toHaveCount(0);
  assert.equal(await page.locator('[data-export-card-host]').innerText(), originalText);
  await app.evaluate(({ clipboard }) => {
    globalThis.__realClipboardWrite = clipboard.writeImage;
    globalThis.__failedClipboardWrites = 0;
    clipboard.writeImage = () => { globalThis.__failedClipboardWrites++; throw new Error("Controlled native clipboard failure"); };
  });
  await panel.getByTestId("copy-image-button").click();
  await expect(panel.getByTestId("output-failure")).toHaveAttribute("data-output-action", "copy", { timeout: 20_000 });
  assert.equal(await app.evaluate(() => globalThis.__failedClipboardWrites), 1);
  await app.evaluate(({ clipboard }) => { clipboard.writeImage = globalThis.__realClipboardWrite; });
  await panel.getByTestId("retry-image-output").click();
  await expect(panel.getByTestId("copy-image-button")).toBeEnabled({ timeout: 20_000 });
  await expect(panel.getByTestId("output-failure")).toHaveCount(0);
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readImage().isEmpty()), false);
  assert.equal(await page.locator('[data-export-card-host]').innerText(), originalText);
  console.log(JSON.stringify({ ok: true, nativeDownloads: results, interruptedDiskWriteAndRetry: true, clipboardFailureAndRetry: true }));
} finally {
  await closeElectronApplication(app, { label: "desktop-image-output" });
  await rm(userData, { recursive: true, force: true });
}
