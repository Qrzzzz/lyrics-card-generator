import { expect, test, type Page } from "@playwright/test";
import { installDesktopFixture } from "../helpers/desktop-render-fixture";
import { LYRICS_TOOLS } from "../../lib/lyrics-tool-registry";

async function openWorkbench(page: Page) {
  await installDesktopFixture(page);
  await page.goto("/");
  await page.locator('[data-step-id="lyrics"]').click();
  await expect(page.getByTestId("lyrics-editor-original")).toBeVisible();
}

async function search(page: Page, text: string) {
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("lyrics-tool-query")).toBeFocused();
  await page.getByTestId("lyrics-tool-query").fill(text);
}

test("tool registry discovers every tool and routes previews without changing the manuscript", async ({
  page
}) => {
  await openWorkbench(page);
  const source = page.getByTestId("lyrics-editor-original");
  const fixture = "[Verse 1]\n[00:01.00]First line\n\n\nLast line";
  await source.fill(fixture);
  await page.getByTestId("lyrics-command-search").click();
  await expect(page.getByRole("option")).toHaveCount(LYRICS_TOOLS.length);
  for (const tool of LYRICS_TOOLS)
    await expect(page.getByTestId(`lyrics-tool-result-${tool.id}`)).toBeVisible();
  await page.getByTestId("lyrics-tool-query").fill("时间戳");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("lyrics-cleanup-lrc-preview-result")).toBeVisible();
  await expect(source).toHaveValue(fixture);
  await page.getByTestId("lyrics-cleanup-lrc-apply").click();
  await expect(source).toHaveValue("[Verse 1]\nFirst line\n\n\nLast line");
  await page.getByTestId("lyrics-command-undo").click();
  await expect(source).toHaveValue(fixture);
  await search(page, "remove blank lines");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("lyrics-cleanup-blank-all-preview-result")).toBeVisible();
  await expect(source).toHaveValue(fixture);
  await page.getByTestId("lyrics-cleanup-blank-all").click();
  await expect(source).toHaveValue("[Verse 1]\n[00:01.00]First line\nLast line");
  await page.getByTestId("lyrics-command-undo").click();
  await expect(source).toHaveValue(fixture);
  await search(page, "nothing-matches-this");
  await expect(page.getByRole("option")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("lyrics-tool-palette")).toHaveCount(0);
});

test("search and sidebar preserve selection, shared scroll and operation undo", async ({
  page
}) => {
  await openWorkbench(page);
  const source = page.getByTestId("lyrics-editor-original");
  const text = Array.from({ length: 70 }, (_, index) => `Line ${index + 1}  `).join("\n");
  await source.fill(text);
  // This case tests palette preservation, after input restoration has settled.
  await source.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
  const range = await source.evaluate(async (element) => {
    const node = element as HTMLTextAreaElement;
    const start = node.value.indexOf("Line 40");
    node.focus();
    node.setSelectionRange(start, start + 7);
    node.dispatchEvent(new Event("select", { bubbles: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    return { start, end: start + 7 };
  });
  await expect.poll(() => source.evaluate((element) => ({ start: (element as HTMLTextAreaElement).selectionStart, end: (element as HTMLTextAreaElement).selectionEnd }))).toEqual(range);
  await page.getByTestId("lyrics-shared-scroll").evaluate((node) => {
    node.scrollTop = 800;
  });
  const beforeScroll = await page
    .getByTestId("lyrics-shared-scroll")
    .evaluate((node) => node.scrollTop);
  await search(page, "keep selection");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("lyrics-keep-selection-preview")).toBeVisible();
  await expect(source).toHaveValue(text);
  expect(
    await source.evaluate((element) => ({
      start: (element as HTMLTextAreaElement).selectionStart,
      end: (element as HTMLTextAreaElement).selectionEnd
    }))
  ).toEqual(range);
  expect(
    Math.abs(
      (await page.getByTestId("lyrics-shared-scroll").evaluate((node) => node.scrollTop)) -
        beforeScroll
    )
  ).toBeLessThanOrEqual(2);
  await page.getByTestId("lyrics-keep-selection-apply").click();
  await expect(source).toHaveValue("Line 40");
  await page.getByTestId("lyrics-command-undo").click();
  await expect(source).toHaveValue(text);
  await page.getByTestId("lyrics-command-sidebar-toggle").click();
  await expect(page.getByTestId("lyrics-sidebar")).toBeHidden();
  await search(page, "对齐");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("lyrics-sidebar-tab-review")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.getByTestId("lyrics-review-alignment-section")).toBeFocused();
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.getByTestId("lyrics-workspace-split")).toHaveAttribute("data-side-by-side", "false");
  await search(page, "redo");
  await page.keyboard.press("Enter");
  await expect(source).toHaveValue("Line 40");
  await expect(source).toBeFocused();
  await expect(page.getByTestId("lyrics-sidebar")).toBeHidden();
  await search(page, "undo");
  await page.keyboard.press("Enter");
  await expect(source).toHaveValue(text);
  await expect(source).toBeFocused();
});

test("three workspaces keep keyboard navigation and expose all diagnostics including late issues", async ({
  page
}) => {
  await openWorkbench(page);
  await page
    .getByTestId("lyrics-editor-original")
    .fill(Array.from({ length: 45 }, (_, index) => `line ${index}\u200B`).join("\n"));
  await page.getByTestId("lyrics-sidebar-tab-cleanup").focus();
  await page.keyboard.press("End");
  await expect(page.getByTestId("lyrics-sidebar-tab-review")).toBeFocused();
  await expect(page.getByTestId("lyrics-review-issue")).toHaveCount(45);
  await page.getByTestId("lyrics-review-issue").last().click();
  await expect(page.getByTestId("lyrics-editor-original")).toBeFocused();
  await expect(page.getByTestId("lyrics-command-position")).toContainText("45");
  await expect(page.getByTestId("lyrics-line-budget")).toContainText("45 / 36");
  const source = page.getByTestId("lyrics-editor-original");
  // Start this independent fixture from an empty document: pending issue-location
  // selection restoration must not turn replacement into insertion at the old line.
  await source.fill("");
  await expect(source).toHaveValue("");
  const paginatedText = Array.from({ length: 180 }, (_, index) => `line ${index}\u200B`).join("\n");
  await source.fill(paginatedText);
  await expect(source).toHaveValue(paginatedText);
  const issues = page.getByTestId("lyrics-review-invisible-character");
  await expect(issues.getByTestId("lyrics-review-issue")).toHaveCount(100);
  await issues.getByTestId("lyrics-review-next").click();
  await expect(issues.getByTestId("lyrics-review-issue")).toHaveCount(80);
  await issues.getByTestId("lyrics-review-issue").last().click();
  await expect.poll(() => page.getByTestId("lyrics-editor-original").evaluate(element => {
    const node = element as HTMLTextAreaElement;
    return node.value.slice(node.selectionStart, node.selectionEnd);
  })).toBe("line 179\u200B");
});

test("responsive sidebar collapse and drawer search preserve the editor node and return issue focus", async ({
  page
}) => {
  await openWorkbench(page);
  await page.getByTestId("lyrics-editor-original").fill("First\nrepeat\nrepeat\nlast");
  await page.evaluate(() => {
    (window as typeof window & { __lyricsNode?: Element }).__lyricsNode = document.querySelector(
      '[data-testid="lyrics-editor-original"]'
    )!;
  });
  for (const width of [1920, 1280, 900, 600]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.getByTestId("lyrics-workspace-split").getAttribute("data-side-by-side"))
      .toBe(width >= 1280 ? "true" : "false");
    const sidebar = page.getByTestId("lyrics-sidebar");
    if (width >= 1280) {
      await page.getByTestId("lyrics-command-sidebar-toggle").click();
      await expect(sidebar).toBeHidden();
    }
    await search(page, "重复行");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("lyrics-review-duplicate-line")).toBeFocused();
    await page.screenshot({ path: `output/playwright/v6.8.0-workbench-${width}.png` });
    await page.getByTestId("lyrics-review-issue").first().click();
    await expect(page.getByTestId("lyrics-editor-original")).toBeFocused();
    if (width < 1280) await expect(sidebar).toBeHidden();
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __lyricsNode?: Element }).__lyricsNode ===
          document.querySelector('[data-testid="lyrics-editor-original"]')
      )
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1);
  }
});

test("AI setup survives switching among three workspaces and palette cancellation", async ({
  page
}) => {
  await openWorkbench(page);
  await page.getByTestId("lyrics-editor-original").fill("One\nTwo");
  await page.getByTestId("lyrics-sidebar-tab-translation").click();
  if (await page.getByTestId("translation-toggle").getAttribute("aria-checked") !== "true") await page.getByTestId("translation-toggle").click();
  await page.getByTestId("lyrics-editor-translation").fill("甲，乙。");
  await search(page, "AI");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("lyrics-ai-page-back")).toBeFocused();
  await page.evaluate(() => { (window as typeof window & { __aiNode?: Element }).__aiNode = document.querySelector('[data-testid="ai-translate-panel"]')!; });
  await page.getByTestId("lyrics-sidebar-tab-review").click();
  await page.getByTestId("lyrics-sidebar-search").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("lyrics-tool-palette")).toHaveCount(0);
  await expect(page.getByTestId("lyrics-sidebar-search")).toBeFocused();
  await page.getByTestId("lyrics-sidebar-tab-translation").click();
  await expect(page.getByTestId("ai-translate-panel")).toBeVisible();
  await search(page, "format");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("lyrics-editor-translation")).toHaveValue("甲 乙\n");
  await expect(page.getByTestId("ai-translate-panel")).toBeHidden();
  await expect(page.getByTestId("lyrics-editor-translation")).toBeFocused();
  await page.getByTestId("lyrics-sidebar-tab-translation").click();
  await expect(page.getByTestId("ai-translate-panel")).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { __aiNode?: Element }).__aiNode === document.querySelector('[data-testid="ai-translate-panel"]'))).toBe(true);
  await page.getByTestId("lyrics-ai-page-back").click();
  await expect(page.getByTestId("translation-toggle")).toBeVisible();
});

test("bilingual columns retain shared geometry and the three tool surfaces keep their visual hierarchy", async ({ page }) => {
  await openWorkbench(page);
  const source = page.getByTestId("lyrics-editor-original");
  const original = "风从安静的站台吹过\n我们把未说完的话留给明天\n\n灯光照着回家的方向";
  const translated = "Wind crosses the quiet platform\nWe leave unfinished words for tomorrow\n\nThe lights show the way home";
  await source.fill(original);
  await page.getByTestId("lyrics-sidebar-tab-translation").click();
  if (await page.getByTestId("translation-toggle").getAttribute("aria-checked") !== "true") await page.getByTestId("translation-toggle").click();
  await page.getByTestId("lyrics-editor-translation").fill(translated);
  await expect.poll(() => page.getByTestId("lyrics-editor-original").evaluate(node => node.getBoundingClientRect().height)).toBe(
    await page.getByTestId("lyrics-editor-translation").evaluate(node => node.getBoundingClientRect().height)
  );
  for (const tab of ["cleanup", "translation", "review"]) {
    await page.getByTestId(`lyrics-sidebar-tab-${tab}`).click();
    await expect(page.getByTestId(`lyrics-sidebar-tab-${tab}`)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-lyrics-sidebar-page]:not([hidden])')).toHaveCount(1);
    await page.screenshot({ path: `output/playwright/v6.8.0-bilingual-${tab}.png` });
    await expect(source).toHaveValue(original);
    await expect(page.getByTestId("lyrics-editor-translation")).toHaveValue(translated);
  }
  await search(page, "AI");
  await expect(page.getByRole("option").first()).toHaveAttribute("data-testid", "lyrics-tool-result-ai");
  await expect(page.getByTestId("lyrics-tool-palette")).toHaveCSS("opacity", "1");
  await expect(page.getByTestId("lyrics-tool-palette").getByRole("dialog")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "output/playwright/v6.8.0-tool-search.png" });
  await page.keyboard.press("Escape");
  await expect(source).toHaveValue(original);
});
