import { expect, test, type Page } from "@playwright/test";
import { installDesktopFixture } from "../helpers/desktop-render-fixture";
import type { UserSettings } from "../../lib/settings/types";
import type { Locale } from "../../lib/types";
import { settingsCopy } from "../../lib/settings/copy";
import { waitForChoiceToSettle } from "../../scripts/choice-test-helpers.mjs";

async function open(page: Page, settings: Partial<UserSettings>, locale: Locale = "en") {
  await installDesktopFixture(page, settings);
  await page.addInitScript((locale) => {
    const load = window.lyricsCardDesktop!.loadAppPreferences;
    window.lyricsCardDesktop!.loadAppPreferences = async () => {
      const record = await load();
      if (!record) throw new Error("Desktop preferences fixture missing");
      return { ...record, locale };
    };
    window.lyricsCardDesktop!.setWindowMaterial = async theme => {
      document.documentElement.dataset.testWindowMaterial = theme;
      return { ok: true, applied: "none", reason: "fixture" };
    };
  }, locale);
  await page.goto("/");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-preferences-loaded", "true");
}

test("system appearance updates shell, native material request and an already-open command portal without changing the card", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await open(page, { uiThemeMode: "system" });
  await expect(page.locator("body")).toHaveAttribute("data-ui-theme", "light");
  await page.locator('[data-step-id="export"]').click();
  const card = page.locator('[data-export-card-host] [data-export-card="true"]').first();
  await expect(page.getByTestId("complete-export-button")).toBeEnabled();
  const before = await card.evaluate(node => node.outerHTML);
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("lyrics-tool-query")).toBeFocused();
  await page.getByTestId("lyrics-tool-query").fill("settings");
  const palette = page.getByTestId("lyrics-tool-palette");
  const paletteColor = () => palette.evaluate(node => getComputedStyle(node).getPropertyValue("--app-text-primary"));
  const lightColor = await paletteColor();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveAttribute("data-ui-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-test-window-material", "dark");
  await expect.poll(paletteColor).not.toBe(lightColor);
  await expect(page.getByTestId("lyrics-tool-query")).toBeFocused();
  await expect(page.getByTestId("lyrics-tool-query")).toHaveValue("settings");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveAttribute("data-ui-theme", "light");
  await expect.poll(paletteColor).toBe(lightColor);
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  expect(await card.evaluate(node => node.outerHTML)).toBe(before);
});

test("system acrylic resolves both variants and restores the saved system choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page, { uiThemeMode: "system", uiAcrylicEnabled: true });
  await expect(page.locator("body")).toHaveAttribute("data-ui-theme", "dark-acrylic");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveAttribute("data-ui-theme", "light-acrylic");
  await expect(page.locator("html")).toHaveAttribute("data-test-window-material", "light-acrylic");
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ui-theme", "light-acrylic");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveAttribute("data-ui-theme", "dark-acrylic");
});

for (const mode of ["dark", "light", "album-dynamic"] as const) {
  test(`explicit ${mode} choice survives system appearance changes`, async ({ page }) => {
    await open(page, { uiThemeMode: mode });
    for (const colorScheme of ["dark", "light"] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator("body")).toHaveAttribute("data-ui-theme", mode);
    }
  });
}

test("system theme choice remains reachable with large text in a compact window and forced colors", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 560, height: 700 });
  await open(page, { uiThemeMode: "system", uiTextSize: "extra-large" });
  await page.getByTestId("settings-button").click();
  // Compact settings use the section menu; the desktop navigation is hidden.
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page.getByRole("button", { name: "Appearance", exact: true }).filter({ visible: true }).click();
  const theme = page.getByRole("combobox", { name: settingsCopy.en.theme, exact: true });
  await expect(theme).toContainText("Follow system");
  await waitForChoiceToSettle(theme);
  await theme.click();
  const menu = page.getByRole("listbox", { name: settingsCopy.en.theme, exact: true });
  const lightColor = await menu.evaluate(node => getComputedStyle(node).getPropertyValue("--app-text-primary"));
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => menu.evaluate(node => getComputedStyle(node).getPropertyValue("--app-text-primary"))).not.toBe(lightColor);
  await expect(page.getByRole("option", { name: "Follow system", exact: true })).toBeInViewport();
  await page.getByRole("option", { name: "Follow system", exact: true }).click();
  await page.emulateMedia({ forcedColors: "active", colorScheme: "dark" });
  await expect(page.getByTestId("settings-close-button")).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  await page.getByTestId("settings-close-button").click();
  await expect(page.getByTestId("settings-surface")).not.toHaveAttribute("data-surface-state", "open");
});

for (const locale of ["zh", "zh-TW", "en", "fr", "ja", "es"] as const) {
  test(`system appearance is discoverable and fits large-text compact settings in ${locale}`, async ({ page }) => {
    await open(page, { uiThemeMode: "dark", uiTextSize: "extra-large" }, locale);
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-tab-appearance").click();
    await page.setViewportSize({ width: 560, height: 700 });
    const field = page.locator('[data-choice-values="album-dynamic dark light system"]');
    await waitForChoiceToSettle(field.getByRole("combobox"));
    await field.getByRole("combobox").click();
    const option = page.getByRole("option", { name: settingsCopy[locale].system, exact: true });
    await expect(option).toBeInViewport();
    expect(await option.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await option.click();
    await expect(page.locator('[role="listbox"][data-choice-menu="album-dynamic dark light system"]')).toHaveCount(0);
    await expect(field.getByRole("combobox")).toContainText(settingsCopy[locale].system);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("lyric-card-generator-app-preferences-v2")!).userSettings.uiThemeMode)).toBe("system");
    await page.getByTestId("settings-surface").screenshot({ path: `output/playwright/v6.8.3/system-${locale}.png` });
  });
}
