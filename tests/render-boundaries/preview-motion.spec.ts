import { expect, test, type Page } from "@playwright/test";
import { installDesktopFixture } from "../helpers/desktop-render-fixture";

async function open(page: Page, enabled = true) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installDesktopFixture(page, { previewMotionEnabled: enabled });
  await page.goto("/");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-preferences-loaded", "true");
  await page.locator('[data-step-id="layout"]').click();
}
async function setMotion(page: Page, enabled: boolean) {
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-tab-appearance").click();
  const toggle = page.getByTestId("preview-motion-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", String(!enabled));
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(enabled));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("lyric-card-generator-app-preferences-v2")!).userSettings.previewMotionEnabled)).toBe(enabled);
  await page.getByTestId("settings-close-button").click();
  await expect(page.getByTestId("settings-surface")).not.toHaveAttribute("data-surface-state", "open");
}
test("preview motion can be disabled during editing without changing card output", async ({ page }) => {
  await open(page);
  const preview = page.getByTestId("lyric-card-preview-pressure");
  await expect(preview).toHaveAttribute("data-pressure-enabled", "true");
  const card = page.locator('[data-export-card-host] [data-export-card="true"]').first();
  const before = await card.evaluate(node => node.outerHTML);
  await preview.hover({ position: { x: 20, y: 20 } });
  const isStill = () => preview.locator(".preview-pressure-card").evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).isIdentity);
  await expect.poll(isStill).toBe(false);
  await setMotion(page, false);
  await expect(preview).toHaveAttribute("data-pressure-enabled", "false");
  await preview.hover({ position: { x: 40, y: 40 } });
  await expect.poll(isStill).toBe(true);
  expect(await card.evaluate(node => node.outerHTML)).toBe(before);
  await page.locator('[data-step-id="font"]').click();
  await expect(preview).toHaveAttribute("data-pressure-enabled", "false");
  await setMotion(page, true);
  await expect(preview).toHaveAttribute("data-pressure-enabled", "true");
});
test("system and app reduced motion override the independent preview preference", async ({ page }) => {
  await open(page);
  const preview = page.getByTestId("lyric-card-preview-pressure");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(preview).toHaveAttribute("data-pressure-enabled", "false");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(preview).toHaveAttribute("data-pressure-enabled", "true");
  await page.getByTestId("settings-button").click();
  await page.getByRole("switch", { name: /^Reduce motion/ }).click();
  await page.getByTestId("settings-close-button").click();
  await expect(preview).toHaveAttribute("data-pressure-enabled", "false");
});
test("saved disabled preview preference is honored on first open", async ({ page }) => {
  await open(page, false);
  await expect(page.getByTestId("lyric-card-preview-pressure")).toHaveAttribute("data-pressure-enabled", "false");
});
