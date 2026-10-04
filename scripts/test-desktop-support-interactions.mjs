import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import jsQR from "jsqr";
import { prepareEditorLanguage } from "./editor-language-test-helpers.mjs";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

const methods = JSON.parse(await readFile(new URL("../electron/support-addresses.json", import.meta.url), "utf8"));
const root = process.cwd();
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const output = path.join(root, `output/playwright/v${version}`);
const userData = await mkdtemp(path.join(tmpdir(), "lyrics-card-support-"));
await mkdir(output, { recursive: true });
const sourceUrl = process.env.LYRICS_CARD_TEST_SOURCE_URL;
const app = await electron.launch({
  ...(sourceUrl ? { args: [root] } : { executablePath: process.env.LYRICS_CARD_TEST_EXECUTABLE || path.join(root, "release/win-unpacked/Lyrics Card Generator.exe") }),
  env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: userData, ...(sourceUrl ? { ELECTRON_DEV_SERVER_URL: sourceUrl } : {}) },
  timeout: 60_000
});
try {
  // Keep clipboard contents private and restore every format after the test.
  await app.evaluate(({ clipboard }) => {
    globalThis.__supportClipboardBefore = clipboard.availableFormats().map((format) => [format, clipboard.readBuffer(format)]);
    clipboard.writeText("support-test-sentinel");
  });
  const page = await app.firstWindow();
  const selectMethod = async (name) => {
    const radio = page.getByRole("radio", { name, exact: true });
    await page.locator("label").filter({ has: radio }).click();
    assert.equal(await radio.isChecked(), true, `${name} is selected by its visible label`);
  };
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await prepareEditorLanguage(page, "en");
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-tab-general").click();
  const general = page.locator('[data-settings-panel="general"]');
  await general.getByRole("heading", { name: "Reset", exact: true }).waitFor();
  assert.equal(await general.getByRole("heading", { name: "Reset", exact: true }).count(), 1);
  assert.equal(await general.getByRole("heading", { name: "History & storage", exact: true }).count(), 1);
  assert.equal(await general.getByTestId("restore-app-preferences").evaluate((button) => button.closest("section")?.querySelector("h3")?.textContent), "Reset");
  await page.getByTestId("settings-tab-appearance").click();
  assert.deepEqual(await page.locator('[data-settings-panel="appearance"] h3').allTextContents(), ["Theme & material", "Title bar style", "Accent color", "Interface font", "Interaction effects"]);
  await page.getByTestId("settings-tab-about").click();
  await page.getByTestId("support-author-link").click();
  assert.equal(await page.getByTestId("support-author-page").evaluate((el) => document.activeElement === el), true);
  const firstNetwork = page.getByRole("radio", { name: "USDT · TRON", exact: true });
  await firstNetwork.focus();
  await firstNetwork.press("ArrowRight");
  assert.equal(await page.getByRole("radio", { name: "USDT · X Layer", exact: true }).isChecked(), true);
  assert.equal(await page.getByTestId("support-address").textContent(), methods[1].address);
  for (const method of methods) {
    await selectMethod(`${method.asset} · ${method.network}`);
    assert.equal(await page.getByTestId("support-address").textContent(), method.address);
    assert.equal(await page.getByTestId("support-qr").getAttribute("src"), method.qr);
    await page.getByTestId("support-copy-address").click();
    await page.getByTestId("support-copy-status").getByText("Address copied", { exact: true }).waitFor();
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), method.address);
  }
  await page.getByTestId("settings-history-back").click();
  await page.getByTestId("support-author-link").waitFor();
  await page.getByTestId("settings-history-forward").click();
  await page.getByTestId("support-author-page").waitFor();
  assert.deepEqual(await page.locator(".settings-history-bar__link").allTextContents(), ["About", "Support the author"]);
  await page.locator(".settings-history-bar__link").first().click();
  await page.getByTestId("support-author-link").waitFor();
  await page.getByTestId("support-author-link").click();

  // A rejected native copy must not claim success or alter clipboard contents.
  await app.evaluate(({ ipcMain, clipboard }) => {
    clipboard.writeText("support-test-sentinel");
    ipcMain.removeHandler("lyrics-card:copy-support-address");
    ipcMain.handle("lyrics-card:copy-support-address", () => false);
  });
  await page.getByTestId("support-copy-address").click();
  await page.getByTestId("support-copy-status").getByText("Could not copy. Select and copy the address manually.", { exact: true }).waitFor();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), "support-test-sentinel");
  await selectMethod("USDT · X Layer");
  assert.equal(await page.getByTestId("support-copy-status").textContent(), "");

  // Completion from a previous network cannot announce success for the new one.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("lyrics-card:copy-support-address");
    ipcMain.handle("lyrics-card:copy-support-address", () => new Promise((resolve) => { globalThis.__finishSupportCopy = resolve; }));
  });
  await page.getByTestId("support-copy-address").click();
  await selectMethod("USDT · TRON");
  await app.evaluate(() => globalThis.__finishSupportCopy(true));
  assert.equal(await page.getByTestId("support-copy-status").textContent(), "");

  for (const locale of ["zh", "zh-TW", "en", "fr", "ja", "es"]) {
    await page.getByTestId("settings-tab-general").click();
    await page.locator(`[data-testid="language-option"][data-locale="${locale}"]`).click();
    await page.getByTestId("settings-tab-about").click();
    await page.getByTestId("support-author-link").click();
    for (const method of methods) {
      await selectMethod(`${method.asset} · ${method.network}`);
      const qr = page.getByTestId("support-qr");
      await qr.evaluate((img) => img.decode());
      assert.equal(await qr.evaluate((img) => img.naturalWidth > 0), true);
      assert.equal(await page.getByTestId("support-address").textContent(), method.address);
    }
    const axe = await new AxeBuilder({ page }).setLegacyMode().include('[data-testid="support-author-page"]').analyze();
    assert.deepEqual(axe.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => v.id), []);
  }
  await page.getByTestId("settings-tab-general").click();
  await page.locator('[data-testid="language-option"][data-locale="zh"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="app-toast"]').length === 0, undefined, { timeout: 30_000 });
  for (const theme of ["dark", "light"]) {
    await page.getByTestId("settings-tab-appearance").click();
    await page.locator(`[data-settings-panel="appearance"] [data-segment-value="${theme}"]`).click();
    await page.waitForFunction((expected) => document.querySelector(".app-shell")?.getAttribute("data-ui-theme") === expected, theme);
    await page.waitForTimeout(500); // Allow the native material/background transition to settle for screenshots.
    await page.locator(".settings-wing__content").evaluate((el) => { el.scrollTop = 0; });
    await page.screenshot({ path: path.join(output, `appearance-${theme}.png`), animations: "disabled" });
    await page.getByTestId("settings-tab-about").click();
    await page.getByTestId("support-author-link").click();
    for (const method of methods) {
      await selectMethod(`${method.asset} · ${method.network}`);
      assert.equal(await page.getByTestId("support-address").textContent(), method.address, "color spans preserve the complete address without separators");
      assert.equal(await page.locator(".support-wallet-address__start").textContent(), method.address.slice(0, 6));
      assert.equal(await page.locator(".support-wallet-address__end").textContent(), method.address.slice(-6));
      const contrast = await new AxeBuilder({ page }).setLegacyMode().include('[data-testid="support-address"]').withRules(["color-contrast"]).analyze();
      assert.deepEqual(contrast.violations, [], `${theme} ${method.network} address contrast`);
    }
    for (const [width, height] of [[1280, 900], [1000, 700]]) {
      await app.evaluate(({ BrowserWindow }, size) => { const window = BrowserWindow.getAllWindows()[0]; window.unmaximize(); window.setContentSize(...size); }, [width, height]);
      await page.waitForFunction((w) => Math.abs(innerWidth - w) <= 2, width);
      assert.equal(await page.getByTestId("support-author-page").evaluate((el) => el.scrollWidth > el.clientWidth + 1), false);
      for (const method of methods) {
        await selectMethod(`${method.asset} · ${method.network}`);
        const qr = page.getByTestId("support-qr");
        await qr.evaluate((img) => img.decode());
        const pixels = await qr.screenshot({ animations: "disabled", scale: "css" });
        const { data, info } = await sharp(pixels).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
        assert.equal(decoded?.data, method.address, `${theme} ${width}px ${method.network} rendered QR`);
      }
      await page.screenshot({ path: path.join(output, `support-${theme}-${width}.png`), animations: "disabled" });
    }
  }
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const selectedOutline = await page.locator(".support-method-option.is-active").evaluate((el) => {
    const style = getComputedStyle(el);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  assert.notEqual(selectedOutline.width, "0px", "selected network remains visible in forced colors");
  assert.notEqual(selectedOutline.style, "none");
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  assert.deepEqual(errors, []);
  console.log("Desktop support: two native clipboard writes; failure/stale feedback; history; six locales; dark/light; 1000/1280px; a11y passed.");
} finally {
  await app.evaluate(({ clipboard }) => {
    clipboard.clear();
    for (const [format, data] of globalThis.__supportClipboardBefore ?? []) clipboard.writeBuffer(format, data);
  }).catch(() => {});
  await closeElectronApplication(app);
}
