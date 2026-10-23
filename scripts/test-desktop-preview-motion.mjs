import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect } from '@playwright/test';
import { prepareEditorLanguage } from './editor-language-test-helpers.mjs';
import { closeElectronApplication } from './electron-test-lifecycle.mjs';

const profile = await mkdtemp(path.join(tmpdir(), 'lyrics-preview-motion-'));
const output = path.resolve('output/playwright/v6.8.4');
await mkdir(output, { recursive: true });
let app, page;
async function launch() {
  app = await electron.launch({ executablePath: path.resolve('release/win-unpacked/Lyrics Card Generator.exe'), env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: profile }, timeout: 60_000 });
  page = await app.firstWindow({ timeout: 60_000 });
  await prepareEditorLanguage(page, 'en');
}
async function preference() {
  return page.evaluate(async () => (await window.lyricsCardDesktop.loadAppPreferences()).userSettings.previewMotionEnabled);
}
try {
  await launch();
  await page.getByTestId('settings-button').click();
  await page.getByTestId('settings-tab-appearance').click();
  const toggle = page.getByTestId('preview-motion-toggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect.poll(preference).toBe(false);
  await page.screenshot({ path: path.join(output, 'native-setting.png') });
  await page.getByTestId('settings-close-button').click();
  await closeElectronApplication(app, { label: 'preview-motion-restart' }); app = undefined;
  await launch();
  assert.equal(await preference(), false);
  await page.locator('[data-step-id="layout"]').click();
  await expect(page.getByTestId('lyric-card-preview-pressure')).toHaveAttribute('data-pressure-enabled', 'false');
  await page.screenshot({ path: path.join(output, 'native-restored.png') });
  console.log('Native preview motion preference saved to desktop storage and restored after process restart');
} finally {
  await closeElectronApplication(app, { label: 'preview-motion' });
  await rm(profile, { recursive: true, force: true });
}
