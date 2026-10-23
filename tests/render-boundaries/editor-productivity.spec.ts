import { expect, test, type Page } from "@playwright/test";
import { installDesktopFixture } from "../helpers/desktop-render-fixture";

async function open(page: Page) { await installDesktopFixture(page); await page.goto("/"); await expect(page.locator('.app-shell')).toHaveAttribute("data-preferences-loaded", "true"); }
async function command(page: Page, query: string, id: string) {
  await page.keyboard.press("Control+k");
  await page.getByTestId("lyrics-tool-query").fill(query);
  await page.getByTestId("app-command-result-" + id).click();
  await expect(page.getByTestId("lyrics-tool-palette")).toHaveCount(0);
}
test("precision drafts validate before commit, accept locale decimals and preserve spacing rules", async ({ page }) => {
  await open(page);
  await page.locator('[data-step-id="font"]').click();
  const exact = page.getByRole("spinbutton", { name: "Line Height · Exact value", exact: true });
  const slider = page.getByRole("slider", { name: "Line Height", exact: true });
  await expect(exact).toBeVisible();
  const old = await slider.inputValue();
  await exact.fill(""); await exact.press("Tab");
  await expect(exact).toHaveAttribute("aria-invalid", "true"); await expect(slider).toHaveValue(old);
  await exact.fill("1.83"); await exact.press("Enter");
  await expect(exact).toHaveAttribute("aria-invalid", "true"); await expect(slider).toHaveValue(old);
  await exact.press("Escape"); await expect(exact).toHaveValue(old);
  await exact.fill("1,65"); await exact.press("Enter");
  await expect(slider).toHaveValue("1.65"); await expect(exact).toHaveValue("1.65");
  await exact.press("ArrowUp"); await expect(slider).toHaveValue("1.7");
  await page.getByRole("button", { name: "Restore default · Line Height", exact: true }).click();
  await expect(slider).toHaveValue("1.8");
});
test("settings have a single owner and exact canvas dimensions agree with the slider", async ({ page }) => {
  await open(page);
  await page.locator('[data-step-id="layout"]').click();
  await expect(page.getByRole("slider", { name: "Line Height", exact: true })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Background Grid", exact: true })).toBeVisible();
  const auto = page.getByRole("switch", { name: "Auto Width", exact: true });
  if (await auto.getAttribute("aria-checked") === "true") await auto.click();
  const width = page.getByRole("spinbutton", { name: "Width · Exact value", exact: true });
  await width.fill("1001"); await width.press("Enter");
  await expect(page.getByRole("slider", { name: "Width", exact: true })).toHaveValue("1001");
  await page.locator('[data-step-id="font"]').click();
  await expect(page.getByRole("slider", { name: "Line Height", exact: true })).toBeVisible();
  await expect(page.getByTestId("separator-style-settings")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Background Grid", exact: true })).toHaveCount(0);
  await page.locator('[data-step-id="visual"]').click();
  await expect(page.getByTestId("separator-style-settings")).toHaveCount(0);
});
test("global commands route across steps and settings, and cancellation restores editing focus", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Control+k");
  await page.getByTestId("lyrics-tool-query").fill("translation scale");
  await expect(page.getByTestId("app-command-result-field-translationScale")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("app-command-result-field-translationScale")).toContainText("Enable translation");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("lyrics-tool-palette")).toHaveCount(0);
  await command(page, "line spacing", "field-lineHeight");
  await expect(page.getByRole("spinbutton", { name: "Line Height · Exact value" })).toBeFocused();
  await command(page, "settings", "settings");
  await expect(page.getByTestId("settings-surface")).toHaveAttribute("data-surface-state", "open");
  await command(page, "字号", "field-fontSize");
  await expect(page.getByRole("spinbutton", { name: "Font Size · Exact value" })).toBeFocused();
  await page.locator('[data-step-id="lyrics"]').click();
  const original = page.getByTestId("lyrics-editor-original");
  await original.fill("First line\nSecond line");
  await original.focus();
  await original.evaluate(node => (node as HTMLTextAreaElement).setSelectionRange(2, 8));
  await page.keyboard.press("Control+k");
  await page.getByTestId("lyrics-tool-query").fill("空行");
  await expect(page.getByTestId("lyrics-tool-result-trim")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(original).toBeFocused();
  expect(await original.evaluate(node => [(node as HTMLTextAreaElement).selectionStart, (node as HTMLTextAreaElement).selectionEnd])).toEqual([2, 8]);
  await expect(original).toHaveValue("First line\nSecond line");
});
test("interface text size persists and leaves the export card geometry and type unchanged", async ({ page }) => {
  await open(page);
  await page.locator('[data-step-id="export"]').click();
  await expect(page.getByTestId("complete-export-button")).toBeEnabled();
  const card = page.locator('[data-export-card-host] [data-export-card="true"]').first();
  const measure = () => card.evaluate(node => ({
    width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
    type: [...node.querySelectorAll("*")].map(child => { const s = getComputedStyle(child); return [s.fontSize, s.lineHeight]; })
  }));
  const before = await measure();
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-tab-appearance").click();
  await page.getByTestId("interface-text-size").selectOption("extra-large");
  await page.getByTestId("settings-close-button").click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-ui-text-size", "extra-large");
  expect(await measure()).toEqual(before);
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect(page.getByTestId("complete-export-button")).toBeInViewport();
  await expect(page.getByTestId("copy-image-button")).toBeInViewport();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("lyric-card-generator-app-preferences-v2")!).userSettings.uiTextSize)).toBe("extra-large");
});

test("commands respect an unfinished font draft and keep its focus and query", async ({ page }) => {
  await open(page);
  await page.locator('[data-step-id="font"]').click();
  await page.getByTestId("edit-custom-font-scheme").click();
  const query = page.getByTestId("font-picker-search");
  await query.fill("Arial");
  await page.keyboard.press("Control+k");
  await page.getByTestId("lyrics-tool-query").fill("export");
  await expect(page.getByTestId("app-command-result-export")).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("lyrics-tool-palette")).toBeVisible();
  await page.getByTestId("lyrics-tool-query").fill("remove blank lines");
  await expect(page.getByTestId("lyrics-tool-result-remove-blank")).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await expect(query).toBeFocused();
  await expect(query).toHaveValue("Arial");
  await expect(page.getByTestId("cancel-custom-font-scheme")).toBeVisible();
});
