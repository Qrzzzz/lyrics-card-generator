import assert from "node:assert/strict";

export async function waitForEditorPreferences(page) {
  await page.locator('.app-shell[data-preferences-loaded="true"]').waitFor({ state: "visible", timeout: 60_000 });
  assert.equal(await page.getByTestId("first-launch-language-dialog").count(), 0, "startup opens the editor without a language dialog");
}

// Suites that require a particular language use the same settings control as users.
export async function prepareEditorLanguage(page, locale) {
  await waitForEditorPreferences(page);
  const documentLanguage = locale === "zh" ? "zh-CN" : locale;
  if (await page.locator("html").getAttribute("lang") === documentLanguage) return;
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await page.getByTestId("settings-tab-general").click();
  await page.locator(`[data-testid="language-option"][data-locale="${locale}"]`).click();
  await page.waitForFunction((expected) => window.localStorage.getItem("lyric-card-generator-locale") === expected, locale);
  await page.getByTestId("settings-close-button").click();
  // Reset navigation history so subsequent assertions start from a fresh editor.
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForEditorPreferences(page);
  assert.equal(await page.locator("html").getAttribute("lang"), documentLanguage, "language persists across reload");
}
