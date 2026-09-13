import { expect, test, type Page } from "@playwright/test";
import type { Server } from "node:http";
import { startStaticServer, closeStaticServer } from "../helpers/static-test-server";

let server: Server;
let baseUrl: string;
test.beforeAll(async () => { ({ server, baseUrl } = await startStaticServer(process.cwd(), "Responsive workbench")); });
test.afterAll(async () => { await closeStaticServer(server); });

async function open(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("lyrics-card-web-lite-preferences-v1", JSON.stringify({ version: 1, locale: "en" })));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("web-lite-editor-surface")).toBeVisible();
}

async function checkSettings(page: Page) {
  expect(await page.locator('[data-workbench-panel="editor-settings"] .editor-settings-layout').evaluate((root) => {
    const problems: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>(".editor-settings-grid, .editor-settings-field, .editor-font-option, .segmented-control__item")) {
      if (el.clientWidth && el.scrollWidth > el.clientWidth + 1) problems.push(el.textContent?.slice(0, 50) ?? "overflow");
    }
    const panel = root.getBoundingClientRect();
    if (panel.left < -1 || panel.right > document.documentElement.clientWidth + 1) problems.push("settings outside viewport");
    return problems;
  })).toEqual([]);
}

test("settings fit supported window sizes and every allowed split endpoint", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  for (const [w, h] of [[320, 568], [375, 667], [768, 1024], [1000, 700], [1023, 768], [1024, 768], [1280, 720], [1440, 900], [1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const step of ["layout", "font", "visual"]) {
      await page.locator(`[data-step-id="${step}"]`).click();
      await checkSettings(page);
      if (w >= 1024) {
        const splitter = page.getByTestId("preview-workbench-resizer");
        for (const key of ["Home", "ArrowRight", "End"]) {
          await splitter.focus();
          await splitter.press(key);
          await checkSettings(page);
        }
      }
    }
  }
});

test("dragging the settings split keeps the active input and output geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  await page.locator('[data-step-id="layout"]').click();
  const input = page.getByRole("slider", { name: "Font Size", exact: true });
  await input.focus();
  await input.press("ArrowRight");
  const value = await input.inputValue();
  const exportCard = page.locator('[data-export-card-host] [data-export-card="true"]').first();
  const before = await exportCard.boundingBox();
  const splitter = page.getByTestId("preview-workbench-resizer");
  const box = await splitter.boundingBox();
  if (!box) throw new Error("Splitter unavailable");
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 250, box.y + 30, { steps: 30 });
  await page.mouse.move(box.x, box.y + 30, { steps: 30 });
  await page.mouse.up();
  await expect(input).toHaveValue(value);
  const after = await exportCard.boundingBox();
  expect(after?.width).toBe(before?.width);
  expect(after?.height).toBe(before?.height);
  await checkSettings(page);
});
