import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = process.env.LYRICS_CARD_TEST_EXECUTABLE?.trim()
  ? path.resolve(process.env.LYRICS_CARD_TEST_EXECUTABLE)
  : path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe");
const userDataDirectory = await mkdtemp(path.join(tmpdir(), "lyrics-card-clipboard-test-"));
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

let electronApp;
try {
  electronApp = await electron.launch({
    executablePath,
    env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: userDataDirectory },
    timeout: 60_000
  });
  const page = await electronApp.firstWindow({ timeout: 60_000 });
  const rendererErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") rendererErrors.push(message.text());
  });
  page.on("pageerror", (error) => rendererErrors.push(error.stack || error.message));

  const firstLaunch = page.getByTestId("first-launch-language-dialog");
  await firstLaunch.waitFor({ state: "visible", timeout: 60_000 });
  await page.locator('[data-testid="first-launch-language"][data-locale="zh"]').click();
  await firstLaunch.waitFor({ state: "hidden", timeout: 15_000 });

  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.unmaximize();
    window.setContentSize(1280, 900, false);
  });
  await page.waitForFunction(() => Math.abs(innerWidth - 1280) <= 2 && Math.abs(innerHeight - 900) <= 2);

  const songImport = page.getByTestId("song-import-aside");
  await songImport.getByTestId("song-info-toggle").click();
  const songEditor = songImport.getByTestId("song-info-editor");
  await songEditor.waitFor({ state: "visible" });
  await songEditor.locator('input[type="file"]').setInputFiles({
    name: "clipboard-local-cover.png",
    mimeType: "image/png",
    buffer: tinyPng
  });
  const saveSong = songEditor.getByTestId("song-info-save");
  await saveSong.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const save = document.querySelector('[data-testid="song-info-save"]');
    return save instanceof HTMLButtonElement && !save.disabled;
  });
  await saveSong.click();
  await songImport.getByTestId("song-info-summary").waitFor({ state: "visible" });

  await page.locator('button[data-step-id="export"]').click();
  const exportPanel = page.locator('[data-testid="export-settings-panel"][data-active="true"]');
  await exportPanel.waitFor({ state: "visible", timeout: 15_000 });
  await exportPanel.locator('[data-segment-value="webp"]').click();
  await exportPanel.locator('[data-segment-value="high"]').click();

  const copyImageButton = exportPanel.getByTestId("copy-image-button");
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="export-settings-panel"][data-active="true"] [data-testid="copy-image-button"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 15_000 });
  assert.match(await copyImageButton.textContent() ?? "", /复制图片/, "copy action has a visible localized label");

  const card = page.locator('[data-export-card-host] [data-export-card="true"]').first();
  const cardSize = await card.evaluate((element) => ({ width: element.offsetWidth, height: element.offsetHeight }));
  const coverSource = await card.locator('[data-card-album-cover="true"] img').getAttribute("src");
  assert.match(coverSource ?? "", /^blob:/, "desktop regression exercises an uploaded local blob cover");

  await electronApp.evaluate(({ clipboard }) => clipboard.clear());
  await copyImageButton.click();
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="app-toast"]')?.textContent?.trim() === "图片已复制到剪贴板"
  ), undefined, { timeout: 15_000 });

  const clipboardImage = await electronApp.evaluate(({ clipboard }) => {
    const image = clipboard.readImage();
    return { empty: image.isEmpty(), size: image.getSize() };
  });
  assert.equal(clipboardImage.empty, false, "copy writes a native image instead of clipboard text");
  assert.deepEqual(
    clipboardImage.size,
    { width: cardSize.width * 2, height: cardSize.height * 2 },
    "copy uses PNG at the selected high-quality pixel ratio"
  );
  assert.equal(
    await exportPanel.locator('[data-segment-value="webp"]').getAttribute("aria-checked"),
    "true",
    "copy keeps the selected download format unchanged"
  );
  assert.deepEqual(rendererErrors, [], `copy flow has no renderer errors: ${JSON.stringify(rendererErrors)}`);

  process.stdout.write(
    `[desktop-clipboard] copied ${clipboardImage.size.width}x${clipboardImage.size.height} PNG from a local cover; WebP download selection preserved.\n`
  );
} finally {
  await closeElectronApplication(electronApp, { label: "desktop-clipboard" });
  await rm(userDataDirectory, { recursive: true, force: true });
}
