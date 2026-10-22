import { expect, test, type Page } from "@playwright/test";
import { installDesktopFixture } from "../helpers/desktop-render-fixture";

async function openEditor(page: Page, autosave = true) {
  await installDesktopFixture(page, { importHistoryLimit: autosave ? 10 : "none" });
  await page.goto("/");
  await page.locator('[data-step-id="lyrics"]').click();
  await expect(page.getByTestId("lyrics-editor-original")).toBeVisible();
}

async function bilingual(page: Page) {
  await page.getByRole("tab", { name: "Bilingual", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Enable Translation", exact: true });
  if (await toggle.getAttribute("aria-checked") !== "true") await toggle.click();
  return page.getByTestId("lyrics-editor-translation");
}

test("mode changes preserve authored bilingual text and hide it only for presentation", async ({ page }) => {
  await openEditor(page);
  const source = "  Source line\n<separator />\n尾行🙂\n";
  const translation = "  译文首行\n<separator />\nLast translated line\n";
  await page.getByTestId("lyrics-editor-original").fill(source);
  await (await bilingual(page)).fill(translation);
  await page.locator('[data-step-id="layout"]').click();
  await page.getByRole("radio", { name: "Instrumental / No Lyrics", exact: true }).click();
  await page.getByRole("radio", { name: "Lyrics", exact: true }).click();
  await page.locator('[data-step-id="lyrics"]').click();
  await expect(page.getByTestId("lyrics-editor-original")).toHaveValue(source);
  await expect(await bilingual(page)).toHaveValue(translation);
  const toggle = page.getByRole("switch", { name: "Enable Translation", exact: true });
  await toggle.click();
  await toggle.click();
  await expect(page.getByTestId("lyrics-editor-translation")).toHaveValue(translation);
});

for (const autosave of [true, false]) {
  test(`clear confirms scope and cancel preserves the document (autosave ${autosave})`, async ({ page }) => {
    await openEditor(page, autosave);
    const original = page.getByTestId("lyrics-editor-original");
    await original.fill("Keep this manuscript");
    await (await bilingual(page)).fill("保留译文");
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("cover art, original lyrics, and translation");
      await dialog.dismiss();
    });
    await page.getByTestId("clear-all-button").click();
    await expect(original).toHaveValue("Keep this manuscript");
    await expect(page.getByTestId("lyrics-editor-translation")).toHaveValue("保留译文");
    page.once("dialog", dialog => dialog.accept());
    await page.getByTestId("clear-all-button").click();
    await expect(original).toHaveValue("");
    await expect(page.getByTestId("lyrics-editor-translation")).toHaveCount(0);
  });
}

test("failed persistence prevents even a confirmed clear", async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    Object.assign(window.lyricsCardDesktop!, { writeEditorDraft: async () => ({ ok: false, code: "write_failed" }) });
  });
  const original = page.getByTestId("lyrics-editor-original");
  await original.fill("Unsaved text stays intact");
  page.once("dialog", dialog => dialog.accept());
  await page.getByTestId("clear-all-button").click();
  await expect(original).toHaveValue("Unsaved text stays intact");
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-save-state", "error");
});

test("free step navigation never claims earlier steps passed validation", async ({ page }) => {
  await openEditor(page);
  await page.locator('[data-step-id="export"]').click();
  await expect(page.locator('[data-step-id="export"]')).toHaveAttribute("aria-current", "step");
  await expect(page.locator('button[data-complete="true"]')).toHaveCount(0);
  await expect(page.locator('[data-step-id="layout"]')).toHaveAttribute("data-step-state", "upcoming");
  await page.locator('[data-step-id="lyrics"]').click();
  await expect(page.locator('[data-step-id="export"]')).toHaveAttribute("data-step-state", "visited");
});

test("bilingual headings stay visible while shared scrolling and follow the active column", async ({ page }) => {
  await openEditor(page);
  const text = Array.from({ length: 90 }, (_, i) => `Identical line ${i}`).join("\n");
  await page.getByTestId("lyrics-editor-original").fill(text);
  const translated = await bilingual(page);
  await translated.fill(text);
  await expect(page.locator('[data-editor-column-active="true"] .lyrics-editor-column-heading')).toContainText("Translation");
  await page.getByTestId("lyrics-editor-original").focus();
  await expect(page.locator('[data-editor-column-active="true"] .lyrics-editor-column-heading')).toContainText("Original");
  await page.getByTestId("lyrics-shared-scroll").evaluate(el => { el.scrollTop = 700; });
  const scroll = await page.getByTestId("lyrics-shared-scroll").boundingBox();
  for (const heading of await page.locator(".lyrics-editor-column-heading").all()) {
    await expect(heading).toBeVisible();
    const box = await heading.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(scroll!.y - 1);
    expect(box!.y).toBeLessThan(scroll!.y + 40);
  }
  await expect(translated).toHaveValue(text);
});

test("compact workbench keeps navigation and export reachable above the preview", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await openEditor(page);
  await page.getByTestId("lyrics-editor-original").fill(Array.from({ length: 24 }, (_, i) => `Line ${i}`).join("\n"));
  await page.locator('[data-step-id="layout"]').click();
  const next = page.getByTestId("stepper-next-button").filter({ visible: true });
  await expect(next).toBeInViewport({ ratio: 1 });
  await page.locator('[data-step-id="export"]').click();
  const output = page.getByTestId("export-settings-panel").getByTestId("complete-export-button");
  await expect(output).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId("export-settings-panel").getByTestId("copy-image-button")).toBeInViewport({ ratio: 1 });
});

test("window glyphs remain identifiable in forced colors (renderer regression only)", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await openEditor(page);
  for (const name of ["Close", "Minimize", "Maximize"]) {
    const button = page.getByRole("button", { name, exact: true });
    const glyph = button.locator("svg");
    await expect(glyph).toHaveCSS("opacity", "1");
    await expect(button).toHaveCSS("border-top-width", "1px");
    await button.focus();
    await expect(button).toBeFocused();
  }
});

test("output errors persist with retry and recover without altering content", async ({ page }) => {
  await openEditor(page);
  await page.getByTestId("lyrics-editor-original").fill("Retry this exact content");
  await page.locator('[data-step-id="export"]').click();
  await expect(page.getByTestId("export-settings-panel").getByTestId("complete-export-button")).toBeEnabled();
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      if (Reflect.get(window, "failOutput")) throw new Error("controlled output failure");
      return original.apply(this, args);
    };
    Reflect.set(window, "failOutput", true);
  });
  await page.getByTestId("export-settings-panel").getByTestId("complete-export-button").click();
  await expect(page.getByTestId("output-failure")).toHaveAttribute("data-output-action", "export");
  await expect(page.getByTestId("retry-image-output")).toBeEnabled();
  await page.evaluate(() => Reflect.set(window, "failOutput", false));
  const download = page.waitForEvent("download");
  await page.getByTestId("retry-image-output").click();
  await download;
  await expect(page.getByTestId("output-failure")).toHaveCount(0);
  await page.evaluate(() => {
    Object.assign(window.lyricsCardDesktop!, { copyImageToClipboard: async () => false });
  });
  await page.getByTestId("export-settings-panel").getByTestId("copy-image-button").click();
  await expect(page.getByTestId("output-failure")).toHaveAttribute("data-output-action", "copy");
  await page.evaluate(() => {
    Object.assign(window.lyricsCardDesktop!, { copyImageToClipboard: async () => true });
  });
  await page.getByTestId("retry-image-output").click();
  await expect(page.getByTestId("output-failure")).toHaveCount(0);
  await page.locator('[data-step-id="lyrics"]').click();
  await expect(page.getByTestId("lyrics-editor-original")).toHaveValue("Retry this exact content");
});
