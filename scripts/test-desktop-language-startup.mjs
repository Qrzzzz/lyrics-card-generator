import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { documentLanguageForLocale, resolvePreferredLocale } from "../lib/locale-language.ts";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";
import { prepareEditorLanguage, waitForEditorPreferences } from "./editor-language-test-helpers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = process.env.LYRICS_CARD_TEST_EXECUTABLE?.trim()
  ? path.resolve(process.env.LYRICS_CARD_TEST_EXECUTABLE)
  : path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe");
const profile = await mkdtemp(path.join(tmpdir(), "lyrics-card-language-startup-"));
const reportDirectory = path.join(root, "output", "playwright", "desktop-language");
const rendererErrors = [];
let app;
let page;

async function launch() {
  app = await electron.launch({
    executablePath,
    env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: profile },
    timeout: 60_000
  });
  page = await app.firstWindow({ timeout: 60_000 });
  page.on("pageerror", (error) => rendererErrors.push(error.message));
  await waitForEditorPreferences(page);
}

try {
  await mkdir(reportDirectory, { recursive: true });
  await launch();
  const nativeLanguages = await app.evaluate(({ app: nativeApp }) => nativeApp.getPreferredSystemLanguages());
  const expectedLocale = resolvePreferredLocale(nativeLanguages);
  const bridgedLanguages = await page.evaluate(() => window.lyricsCardDesktop.getPreferredSystemLanguages());
  assert.deepEqual(bridgedLanguages, nativeLanguages, "the sandboxed renderer receives the actual OS language preference list");
  assert.equal(await page.locator("html").getAttribute("lang"), documentLanguageForLocale(expectedLocale));
  const savedStartup = await page.evaluate(() => window.lyricsCardDesktop.loadAppPreferences());
  assert.equal(savedStartup.locale, expectedLocale, "first startup persists the detected language without a prompt");
  await page.waitForFunction(() => !document.querySelector('[data-testid="editor-surface"]')?.inert);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  await page.screenshot({ path: path.join(reportDirectory, "first-start.png") });

  // Exercise all six choices through Settings after the first-launch entry point is removed.
  for (const locale of ["zh", "zh-TW", "en", "fr", "ja", "es"]) {
    await prepareEditorLanguage(page, locale);
    assert.equal((await page.evaluate(() => window.lyricsCardDesktop.loadAppPreferences())).locale, locale);
  }
  const manualLocale = expectedLocale === "es" ? "ja" : "es";
  await prepareEditorLanguage(page, manualLocale);
  await closeElectronApplication(app, { label: "desktop-language-before-restart" });
  app = undefined;
  await launch();
  assert.equal(await page.locator("html").getAttribute("lang"), documentLanguageForLocale(manualLocale), "manual selection survives a complete application restart");
  assert.equal((await page.evaluate(() => window.lyricsCardDesktop.loadAppPreferences())).locale, manualLocale);
  assert.deepEqual(rendererErrors, [], "startup and language changes produce no renderer exceptions");
  await page.screenshot({ path: path.join(reportDirectory, "saved-language-restart.png") });
  const result = { ok: true, nativeLanguages, expectedLocale, manualLocale, languageChoices: 6, rendererErrors };
  await writeFile(path.join(reportDirectory, "result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await closeElectronApplication(app, { label: "desktop-language" });
  assert.equal(path.dirname(profile), tmpdir(), "cleanup stays inside the temporary profile directory");
  await rm(profile, { recursive: true, force: true });
}
