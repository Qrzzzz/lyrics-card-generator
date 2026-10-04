import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { _electron as electron } from "playwright";
import { expect } from "@playwright/test";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";
import budgets from "../shared/resource-budgets.json" with { type: "json" };
import preferencesModule from "../electron/user-preferences.js";

const executablePath = process.env.LYRICS_CARD_TEST_EXECUTABLE || path.resolve("release/win-unpacked/Lyrics Card Generator.exe");
const report = path.resolve("output/playwright/history-budget");
await mkdir(report, { recursive: true });
for (const locale of ["en", "zh"]) {
  const profile = await mkdtemp(path.join(tmpdir(), "lyrics-history-budget-"));
  const filePath = path.join(profile, "app-data/import-history.json");
  let app;
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    const handle = await open(filePath, "w");
    try { await handle.truncate(budgets.history.documentBytes + 1); } finally { await handle.close(); }
    const backup = JSON.stringify({ schemaVersion: 2, records: [] });
    await writeFile(`${filePath}.bak`, backup);
    await writeFile(path.join(profile, "app-preferences.json"), JSON.stringify(preferencesModule.normalizeStoredPreferences({ locale, userSettings: { firstLaunchLanguageSelected: true } })));
    app = await electron.launch({ executablePath, env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: profile }, timeout: 60_000 });
    const page = await app.firstWindow({ timeout: 60_000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-save-state", "error", { timeout: 30_000 });
    const notice = page.getByTestId("app-notification").filter({ hasText: "64 MiB" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("app-data/import-history.json");
    await expect(notice.getByRole("button", { name: locale === "en" ? "Try again" : "重试", exact: true })).toBeVisible();
    // Observe the final bounds after the existing entrance animation settles.
    await expect.poll(() => notice.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
    })).toBe(true);
    await page.screenshot({ path: path.join(report, `${locale}.png`), fullPage: true });
    assert.equal((await stat(filePath)).size, budgets.history.documentBytes + 1, "oversized native profile remains untouched");
    assert.equal(await readFile(`${filePath}.bak`, "utf8"), backup);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.deepEqual(errors, []);
    console.log(`Native history budget notice passed: ${locale}, bounded startup, preserved primary/backup, one window.`);
  } finally {
    // This fixture intentionally cannot flush an over-budget profile. Only its
    // owned test process is terminated; the user's installed app is untouched.
    if (app) await app.evaluate(({ app: nativeApp }) => nativeApp.exit(0)).catch(() => {});
    await closeElectronApplication(app, { label: "history-budget" });
    assert.equal(path.dirname(path.resolve(profile)).toLowerCase(), path.resolve(tmpdir()).toLowerCase());
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
