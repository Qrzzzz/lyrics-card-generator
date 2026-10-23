import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect } from '@playwright/test';
import { prepareEditorLanguage } from './editor-language-test-helpers.mjs';
import { selectChoiceValue } from './choice-test-helpers.mjs';
import { closeElectronApplication } from './electron-test-lifecycle.mjs';

// This opt-in acceptance observes real Windows changes. It never changes the OS
// theme, nativeTheme.themeSource or Chromium media preferences to fake a pass.
if (!process.argv.includes('--interactive')) throw Error('Run with --interactive and switch Windows Colors when prompted');
const profile = await mkdtemp(path.join(tmpdir(), 'lyrics-system-appearance-'));
const output = path.resolve('output/playwright/v6.8.3/native-system-appearance');
await mkdir(output, { recursive: true });
let app, page;
const samples = [];
async function launch() {
  app = await electron.launch({ executablePath: path.resolve('release/win-unpacked/Lyrics Card Generator.exe'), env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: profile }, timeout: 60_000 });
  page = await app.firstWindow({ timeout: 60_000 });
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const apply = window.setBackgroundMaterial.bind(window);
    globalThis.__systemAppearanceMaterials = [];
    window.setBackgroundMaterial = value => { globalThis.__systemAppearanceMaterials.push(value); return apply(value); };
  });
  await page.emulateMedia({ colorScheme: null, forcedColors: null });
  await prepareEditorLanguage(page, 'en');
}
async function native() {
  return app.evaluate(({ nativeTheme, BrowserWindow }) => ({
    dark: nativeTheme.shouldUseDarkColors, source: nativeTheme.themeSource,
    highContrast: nativeTheme.shouldUseHighContrastColors,
    material: globalThis.__systemAppearanceMaterials.at(-1) ?? null,
    background: BrowserWindow.getAllWindows()[0].getBackgroundColor()
  }));
}
async function sample(label, dark, acrylic) {
  const main = await native();
  assert.equal(main.source, 'system');
  assert.equal(main.dark, dark);
  assert.equal(main.material, acrylic ? 'acrylic' : 'none');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ui-theme', `${dark ? 'dark' : 'light'}${acrylic ? '-acrylic' : ''}`);
  const renderer = await page.evaluate(() => ({ dark: matchMedia('(prefers-color-scheme: dark)').matches, forcedColors: matchMedia('(forced-colors: active)').matches, theme: document.body.dataset.uiTheme }));
  assert.equal(renderer.dark, dark);
  const saved = await page.evaluate(() => window.lyricsCardDesktop.loadAppPreferences());
  assert.equal(saved.userSettings.uiThemeMode, 'system');
  assert.equal(saved.userSettings.uiAcrylicEnabled, acrylic);
  samples.push({ label, native: main, renderer });
  await page.screenshot({ path: path.join(output, `${label}.png`) });
  await writeFile(path.join(output, 'acceptance.json'), JSON.stringify({ complete: false, samples }, null, 2));
}
async function awaitOs(label, dark, acrylic) {
  console.log(`AWAIT_OS ${label}: set Windows Colors to ${dark ? 'dark' : 'light'}`);
  await expect.poll(async () => (await native()).dark, { timeout: 300_000, intervals: [500] }).toBe(dark);
  await sample(label, dark, acrylic);
}
async function appearance() {
  await page.getByTestId('settings-button').click();
  await page.getByTestId('settings-tab-appearance').click();
}
try {
  await launch();
  assert.equal((await native()).dark, true, 'Start from the original Windows dark setting so final restoration is explicit');
  await appearance();
  await selectChoiceValue(page, 'system');
  await page.getByTestId('settings-close-button').click();
  await page.locator('[data-step-id="export"]').click();
  await expect(page.getByTestId('complete-export-button')).toBeEnabled();
  const card = page.locator('[data-export-card-host] [data-export-card="true"]').first();
  const before = await card.evaluate(node => node.outerHTML);
  await sample('initial-dark', true, false);
  await page.keyboard.press('Control+k');
  await page.getByTestId('lyrics-tool-query').fill('settings');
  const lightToken = () => page.getByTestId('lyrics-tool-palette').evaluate(node => getComputedStyle(node).getPropertyValue('--app-text-primary'));
  const darkToken = await lightToken();
  await awaitOs('system-light', false, false);
  await expect.poll(lightToken).not.toBe(darkToken);
  await expect(page.getByTestId('lyrics-tool-query')).toHaveValue('settings');
  await awaitOs('system-dark', true, false);
  await expect.poll(lightToken).toBe(darkToken);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lyrics-tool-palette')).toHaveCount(0);
  assert.equal(await card.evaluate(node => node.outerHTML), before, 'real system changes preserve the complete card markup');
  await appearance();
  await page.getByRole('switch', { name: /^Acrylic effect/ }).click();
  await page.getByTestId('settings-close-button').click();
  await sample('acrylic-dark', true, true);
  await awaitOs('acrylic-light', false, true);
  await awaitOs('restored-os-dark', true, true);
  await closeElectronApplication(app, { label: 'system-appearance-restart' }); app = undefined;
  await launch();
  await sample('restart-system-dark', true, true);
  await writeFile(path.join(output, 'acceptance.json'), JSON.stringify({ complete: true, osThemeRestored: 'dark', samples, checks: ['native-theme-source-system', 'real-os-dark-light-dark', 'open-portal-live-tokens', 'export-card-unchanged', 'acrylic-variants', 'durable-restart'] }, null, 2));
  console.log('Native system appearance acceptance passed; OS restored to dark');
} finally {
  await closeElectronApplication(app, { label: 'system-appearance' });
  await rm(profile, { recursive: true, force: true });
}
