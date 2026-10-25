import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect } from "@playwright/test";
import { prepareEditorLanguage } from "./editor-language-test-helpers.mjs";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

const label = process.argv.find((arg) => arg.startsWith("--label="))?.slice(8) ?? "current-windows-settings";
assert.match(label, /^[a-z0-9-]+$/);
const expectedScale = Number(process.argv.find((arg) => arg.startsWith("--expected-scale="))?.slice(17));
const requireHighContrast = process.argv.includes("--require-high-contrast");
const profile = await mkdtemp(path.join(tmpdir(), "lyrics-hig-"));
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const output = path.resolve(`output/playwright/v${version}-native`, label);
await mkdir(output, { recursive: true });
let app;
async function environment() {
  return app.evaluate(({ BrowserWindow, screen, nativeTheme }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return {
      bounds: window.getBounds(), minimum: window.getMinimumSize(),
      display: screen.getDisplayMatching(window.getBounds()), displays: screen.getAllDisplays(),
      highContrast: nativeTheme.shouldUseHighContrastColors, forcedColors: nativeTheme.inForcedColorsMode,
      maximized: window.isMaximized(), minimized: window.isMinimized()
    };
  });
}
function assertFits({ bounds: b, display: { workArea: w }, minimum }) {
  assert.ok(b.x >= w.x - 1 && b.y >= w.y - 1 && b.x + b.width <= w.x + w.width + 1 && b.y + b.height <= w.y + w.height + 1, JSON.stringify({ bounds: b, workArea: w }));
  assert.ok(minimum[0] <= w.width && minimum[1] <= w.height);
}
try {
  app = await electron.launch({ executablePath: path.resolve("release/win-unpacked/Lyrics Card Generator.exe"), env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: profile }, timeout: 60_000 });
  const page = await app.firstWindow({ timeout: 60_000 });
  // Playwright otherwise forces "none" even on a native high-contrast desktop.
  // Null removes that override, allowing Chromium to use the real OS setting.
  await page.emulateMedia({ forcedColors: null, colorScheme: null });
  await prepareEditorLanguage(page, "en");
  const textSize = process.argv.find(arg => arg.startsWith("--ui-text-size="))?.slice(15);
  if (textSize) {
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-tab-appearance").click();
    await page.getByTestId("interface-text-size").selectOption(textSize);
    await page.getByTestId("settings-close-button").click();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-ui-text-size", textSize);
  }
  const initial = await environment();
  assertFits(initial);
  if (expectedScale) assert.equal(initial.display.scaleFactor, expectedScale, "Native display scale must match the OS setting; no emulation is used.");
  if (requireHighContrast) {
    assert.equal(initial.highContrast, true);
    assert.equal(initial.forcedColors, true);
    assert.equal(await page.evaluate(() => matchMedia("(forced-colors: active)").matches), true);
    for (const control of ["close", "minimize", "maximize"]) {
      const button = page.locator(`.traffic-light--${control}`);
      await expect(button).toBeVisible();
      const glyph = await button.locator("svg").evaluate((node) => ({ opacity: getComputedStyle(node).opacity, color: getComputedStyle(node).color, background: getComputedStyle(node.parentElement).backgroundColor }));
      assert.equal(glyph.opacity, "1");
      assert.notEqual(glyph.color, glyph.background);
      await button.focus();
      await expect(button).toBeFocused();
    }
  }
  const maximize = page.locator(".traffic-light--maximize");
  await maximize.click();
  await expect.poll(async () => (await environment()).maximized).toBe(true);
  await page.screenshot({ path: path.join(output, "maximized.png") });
  await maximize.click();
  await expect.poll(async () => (await environment()).maximized).toBe(false);
  const restored = await environment();
  assertFits(restored);
  await page.locator(".traffic-light--minimize").click();
  await expect.poll(async () => (await environment()).minimized).toBe(true);
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.restore(); window.show(); });
  await expect.poll(async () => (await environment()).minimized).toBe(false);
  await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const workArea = screen.getDisplayMatching(window.getBounds()).workArea;
    window.setBounds({ x: workArea.x, y: workArea.y, width: Math.min(1000, workArea.width), height: Math.min(700, workArea.height) });
  });
  await page.locator('button[data-step-id="export"]').click();
  const panel = page.locator('[data-testid="export-settings-panel"][data-active="true"]');
  await panel.getByRole("combobox").first().waitFor({ state: "visible" });
  await expect(panel.getByTestId("complete-export-button")).toBeEnabled({ timeout: 20_000 });
  for (const name of ["complete-export-button", "copy-image-button"]) {
    const box = await panel.getByTestId(name).boundingBox();
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, JSON.stringify({ name, box, viewport }));
  }
  const compact = await environment();
  assertFits(compact);
  await page.screenshot({ path: path.join(output, "compact-export.png") });
  const nativeInteractionSamples = [];
  if (process.argv.includes("--interactive")) {
    console.log(`INTERACTIVE_READY ${output}`);
    for (let attempt = 0; attempt < 300; attempt++) {
      const sample = await environment();
      if (JSON.stringify(sample) !== JSON.stringify(nativeInteractionSamples.at(-1))) {
        nativeInteractionSamples.push(sample);
        await writeFile(path.join(output, "interaction-samples.json"), JSON.stringify(nativeInteractionSamples, null, 2));
        await page.screenshot({ path: path.join(output, `interaction-${nativeInteractionSamples.length}.png`) });
      }
      if (await access(path.join(output, "continue")).then(() => true, () => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assertFits(await environment());
  }
  const childProcess = app.process();
  await page.locator(".traffic-light--close").click();
  await expect.poll(() => childProcess.exitCode, { timeout: 20_000 }).not.toBeNull();
  app = undefined;
  await writeFile(path.join(output, "acceptance.json"), JSON.stringify({ label, initial, restored, compact, nativeInteractionSamples, checks: ["initial-work-area", "maximize", "restore-work-area", "minimize", "compact-output-reachability", "close"], interfaceTextSize: textSize ?? "standard", nativeHighContrastVerified: requireHighContrast }, null, 2));
  console.log(JSON.stringify({ ok: true, label, nativeScale: initial.display.scaleFactor, interfaceTextSize: textSize ?? "standard", nativeHighContrastVerified: requireHighContrast, displayCount: initial.displays.length, evidence: output }));
} finally {
  await closeElectronApplication(app, { label: "desktop-hig-stability" });
  await rm(profile, { recursive: true, force: true });
}
