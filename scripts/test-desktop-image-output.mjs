import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
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
let app;
try {
  app = await electron.launch({
    executablePath: process.env.LYRICS_CARD_TEST_EXECUTABLE || path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe"),
    env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: userData }, timeout: 60_000
  });
  const page = await app.firstWindow({ timeout: 60_000 });
  await app.evaluate(({ BrowserWindow }, directory) => {
    globalThis.__imageOutputDownloads = [];
    BrowserWindow.getAllWindows()[0].webContents.session.on("will-download", (_event, item) => {
      const file = `${directory}/${item.getFilename().replace(/^.*[\\/]/, "")}`;
      item.setSavePath(file);
      item.once("done", (_event, state) => globalThis.__imageOutputDownloads.push({ file, state }));
    });
  }, downloads);
  await prepareEditorLanguage(page, "zh");
  await page.locator('button[data-step-id="export"]').click();
  const panel = page.locator('[data-testid="export-settings-panel"][data-active="true"]');
  const button = panel.getByTestId("complete-export-button");
  const results = [];
  for (const format of ["png", "webp", "jpg"]) {
    await panel.locator(`[data-segment-value="${format}"]`).click();
    await panel.locator('[data-segment-value="low"]').click();
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
  console.log(JSON.stringify({ ok: true, nativeDownloads: results }));
} finally {
  await closeElectronApplication(app, { label: "desktop-image-output" });
  await rm(userData, { recursive: true, force: true });
}
