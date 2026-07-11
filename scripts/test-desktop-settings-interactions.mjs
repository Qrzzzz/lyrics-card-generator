import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe");
const reportDirectory = path.join(root, "playwright-report", "desktop");
const userDataDirectory = await mkdtemp(path.join(tmpdir(), "lyrics-card-desktop-test-"));

let electronApp;
let page;
const nativeDialogs = [];

async function waitForVisible(testId) {
  const locator = page.getByTestId(testId);
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  return locator;
}

async function selectSettingsSection(section) {
  await page.getByTestId(`settings-tab-${section}`).click();
  await page.locator(`[data-settings-panel="${section}"]:not([hidden])`).waitFor({ state: "visible" });
}

async function assertPreviewFits(width, height, scrolled) {
  await electronApp.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.unmaximize();
    window.setContentSize(size.width, size.height, false);
  }, { width, height });
  await page.waitForFunction(
    (size) => Math.abs(window.innerWidth - size.width) <= 2 && Math.abs(window.innerHeight - size.height) <= 2,
    { width, height },
    { timeout: 10_000 }
  );
  await page.locator('[data-testid="editor-surface"]').evaluate((element, shouldScroll) => {
    element.scrollTop = shouldScroll ? element.scrollHeight : 0;
  }, scrolled);
  await page.waitForTimeout(250);
  const bounds = await page.getByTestId("lyric-card-preview").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const shell = element.querySelector('[data-testid="lyric-card-preview-shell"]');
    return {
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      shellClientHeight: shell?.clientHeight ?? 0,
      shellScrollHeight: shell?.scrollHeight ?? 0,
      scale: shell?.getAttribute("data-preview-scale") ?? ""
    };
  });
  assert.ok(bounds.top >= -1, `${width}x${height} preview begins above the viewport: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.bottom <= bounds.viewportHeight + 1, `${width}x${height} preview exceeds the viewport: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.shellScrollHeight <= bounds.shellClientHeight + 1, `${width}x${height} preview card is clipped: ${JSON.stringify(bounds)}`);
  assert.ok(Number(bounds.scale) > 0, `${width}x${height} preview scale is invalid: ${JSON.stringify(bounds)}`);
}

try {
  await mkdir(reportDirectory, { recursive: true });
  electronApp = await electron.launch({
    executablePath,
    env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: userDataDirectory },
    timeout: 60_000
  });
  page = await electronApp.firstWindow({ timeout: 60_000 });
  page.on("dialog", async (dialog) => {
    nativeDialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.dismiss();
  });
  page.on("pageerror", (error) => process.stderr.write(`[renderer] ${error.stack || error.message}\n`));

  const firstLaunch = page.getByTestId("first-launch-language-dialog");
  await firstLaunch.waitFor({ state: "visible", timeout: 60_000 });
  await page.locator('[data-testid="first-launch-language"][data-locale="zh"]').click();
  await firstLaunch.waitFor({ state: "hidden", timeout: 15_000 });

  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await waitForVisible("settings-surface");

  await selectSettingsSection("ai");
  await (await waitForVisible("ai-open-library")).click();
  await (await waitForVisible("preset-card-lyrical")).click();
  const presetTitle = await waitForVisible("preset-title-input");
  const presetPrompt = await waitForVisible("preset-prompt-input");
  const initialTitle = await presetTitle.inputValue();
  const initialPrompt = await presetPrompt.inputValue();
  await presetTitle.fill("Desktop single reset regression");
  await presetPrompt.fill("Desktop single reset prompt regression");
  await page.getByTestId("preset-reset").click();
  assert.equal(await presetTitle.inputValue(), initialTitle, "single reset restores the preset title");
  assert.equal(await presetPrompt.inputValue(), initialPrompt, "single reset restores the preset prompt");

  await presetTitle.fill("Desktop reset-all regression");
  await page.getByTestId("settings-history-back").click();
  const resetAll = await waitForVisible("prompt-reset-all");
  assert.equal(await resetAll.isEnabled(), true, "reset-all becomes available after a preset edit");
  await resetAll.click();
  assert.equal(await resetAll.isDisabled(), true, "reset-all becomes disabled after restoring initial content");

  for (const section of ["general", "appearance", "export", "ai", "about"]) {
    await selectSettingsSection(section);
  }
  await selectSettingsSection("ai");
  await (await waitForVisible("ai-open-api")).click();
  await page.getByTestId("ai-base-url-input").fill("https://example.invalid/v1");
  await page.getByTestId("ai-model-input").fill("desktop-regression-model");
  await page.getByTestId("ai-temperature-input").fill("0.4");
  await page.getByTestId("ai-default-style-select").selectOption("lyrical");
  await page.getByTestId("ai-api-key-input").fill("sk-desktop-regression");
  await page.getByTestId("clear-api-key").click();
  await waitForVisible("settings-confirm-overlay");
  await page.getByTestId("confirm-clear-api-key").click();
  await page.getByTestId("ai-api-key-input").waitFor({ state: "visible" });
  await page.getByTestId("settings-history-back").click();
  await waitForVisible("ai-open-library");
  await page.getByTestId("settings-history-forward").click();
  await waitForVisible("ai-base-url-input");

  await selectSettingsSection("ai");
  await (await waitForVisible("ai-open-library")).click();
  await page.getByTestId("preset-create").click();
  await page.getByTestId("preset-title-input").fill("Desktop custom preset");
  await page.getByTestId("preset-prompt-input").fill("Translate the lyrics for the packaged desktop regression test.");
  await page.getByTestId("preset-save").click();
  await waitForVisible("preset-delete");
  await page.getByTestId("preset-delete").click();
  await waitForVisible("settings-confirm-overlay");
  await page.getByTestId("confirm-delete-preset").click();
  await waitForVisible("preset-create");
  assert.deepEqual(nativeDialogs, [], `settings interactions must not open native dialogs: ${JSON.stringify(nativeDialogs)}`);

  await selectSettingsSection("general");
  await selectSettingsSection("ai");
  await page.getByTestId("settings-close-button").click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="open"]').waitFor({ state: "visible" });
  await page.getByTestId("settings-close-button").click();

  for (const size of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 }
  ]) {
    await assertPreviewFits(size.width, size.height, false);
    await assertPreviewFits(size.width, size.height, true);
  }

  await page.screenshot({ path: path.join(reportDirectory, "settings-interaction.png"), fullPage: false });
  process.stdout.write(`${JSON.stringify({ ok: true, nativeDialogs, viewports: ["1366x768", "1440x900", "1920x1080"] }, null, 2)}\n`);
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(reportDirectory, "settings-interaction-failure.png"), fullPage: false }).catch(() => {});
  }
  throw error;
} finally {
  await electronApp?.close().catch(() => {});
  await rm(userDataDirectory, { recursive: true, force: true }).catch(() => {});
}
