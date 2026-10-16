import { installDesktopFixture } from "../helpers/desktop-render-fixture";
import { expect, test, type Page } from "@playwright/test";

const retainedBoundaryNames = [
  "Examples",
  "History",
  "Settings",
  "SettingsGeneral",
  "SettingsAppearance",
  "SettingsExport",
  "SettingsAi",
  "SettingsAbout",
  "AiPanel",
  "ExportPanel"
] as const;

test("retains first-open state while closed surfaces stay outside lyric-input renders", async ({ page }) => {
  await installDesktopFixture(page);
  await page.goto("/");

  const editorSurface = page.getByTestId("editor-surface");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-desktop-shell", "true");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-reduce-motion", "false");
  await expect(editorSurface).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByTestId("first-launch-language-dialog")).toHaveCount(0);

  await expect(page.getByTestId("examples-surface")).toHaveCount(0);
  await expect(page.getByTestId("history-surface")).toHaveCount(0);
  await expect(page.getByTestId("settings-surface")).toHaveCount(0);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const initialDomCount = await page.locator("*").count();
  const initialRootCommits = await page.evaluate(() => (
    (window as typeof window & { __ROOT_COMMIT_COUNT__?: number }).__ROOT_COMMIT_COUNT__ ?? 0
  ));

  await page.getByTestId("examples-button").click();
  const examplesSurface = page.getByTestId("examples-surface");
  await expect(examplesSurface).toBeVisible();
  await retainNode(page, "examples", "[data-testid='examples-surface']");
  const translationSwitch = examplesSurface.getByRole("switch");
  await expect(translationSwitch).toHaveAttribute("aria-checked", "true");
  await translationSwitch.click();
  await expect(translationSwitch).toHaveAttribute("aria-checked", "false");
  await page.getByTestId("examples-close-button").click();
  await expect(examplesSurface).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByTestId("examples-button")).toBeFocused();
  await page.getByTestId("examples-button").click();
  await expect(examplesSurface).toBeVisible();
  await expect(translationSwitch).toHaveAttribute("aria-checked", "false");
  await expectRetainedNode(page, "examples", "[data-testid='examples-surface']");
  await page.getByTestId("examples-close-button").click();

  await page.getByTestId("history-button").click();
  const historySurface = page.getByTestId("history-surface");
  await expect(historySurface).toBeVisible();
  await retainNode(page, "history", "[data-testid='history-surface']");
  const historySearch = page.getByTestId("history-search");
  await historySearch.fill("kept-query");
  await expect.poll(() => historyQueryCount(page)).toBeGreaterThan(1);
  await page.getByTestId("history-close-button").click();
  await expect(historySurface).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByTestId("history-button")).toBeFocused();
  await page.getByTestId("history-button").click();
  await expect(historySurface).toBeVisible();
  await expect(historySearch).toHaveValue("kept-query");
  await expectRetainedNode(page, "history", "[data-testid='history-surface']");
  await page.getByTestId("history-close-button").click();

  await page.getByTestId("settings-button").click();
  const settingsSurface = page.getByTestId("settings-surface");
  await expect(settingsSurface).toBeVisible();
  await expect(settingsSurface.locator("[data-settings-panel]")).toHaveCount(5);
  await retainNode(page, "settings", "[data-testid='settings-surface']");
  await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("[data-settings-panel]"));
    (window as typeof window & { __retainedSettingsPanels?: Element[] }).__retainedSettingsPanels = nodes;
  });
  for (const tab of ["general", "appearance", "export", "ai", "about"] as const) {
    const tabButton = page.getByTestId(`settings-tab-${tab}`);
    await tabButton.click();
    await expect(tabButton).toHaveAttribute("aria-current", "page");
    if (tab === "ai") {
      await expect(page.getByTestId("settings-page-heading-ai")).toBeVisible();
    }
  }
  await page.getByTestId("settings-close-button").click();
  await expect(settingsSurface).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByTestId("settings-button")).toBeFocused();
  await page.getByTestId("settings-button").click();
  await expect(settingsSurface).toBeVisible();
  await expect(page.getByTestId("settings-tab-about")).toHaveAttribute("aria-current", "page");
  await expect(settingsSurface.locator("[data-settings-panel]")).toHaveCount(5);
  await expectRetainedNode(page, "settings", "[data-testid='settings-surface']");
  expect(await page.evaluate(() => {
    const retained = (window as typeof window & { __retainedSettingsPanels?: Element[] }).__retainedSettingsPanels;
    const current = Array.from(document.querySelectorAll("[data-settings-panel]"));
    return retained?.length === current.length && retained.every((node, index) => node === current[index]);
  })).toBe(true);
  await page.getByTestId("settings-close-button").click();

  await page.locator('[data-step-id="lyrics"]').click();
  const lyricsEditor = page.getByTestId("lyrics-editor-original");
  await expect(lyricsEditor).toBeVisible();
  await lyricsEditor.fill("First line\nSecond line\nThird line\nFourth line");

  await page.getByTestId("lyrics-command-ai").click();
  await expect(page.getByTestId("ai-translate-panel")).toBeVisible();
  await expect(page.getByTestId("lyrics-ai-page-back")).toBeFocused();
  const visibleAnimationWork = await continuousEditorAnimationWork(page);
  expect(visibleAnimationWork.runningInfinite).toBeGreaterThanOrEqual(1);
  expect(visibleAnimationWork.aiDecorationStates).toEqual(["running"]);
  await page.getByTestId("examples-button").click();
  await expect(editorSurface).toHaveAttribute("aria-hidden", "true");
  await expect(editorSurface).toHaveAttribute("data-surface-work", "paused");
  const hiddenAnimationWork = await continuousEditorAnimationWork(page);
  expect(hiddenAnimationWork.runningInfinite).toBe(0);
  expect(hiddenAnimationWork.aiDecorationStates).toEqual(["paused"]);
  await page.getByTestId("examples-close-button").click();
  await expect(editorSurface).toHaveAttribute("data-surface-work", "running");
  await expect(page.getByTestId("examples-button")).toBeFocused();
  const resumedAnimationWork = await continuousEditorAnimationWork(page);
  expect(resumedAnimationWork.runningInfinite).toBe(visibleAnimationWork.runningInfinite);
  expect(resumedAnimationWork.aiDecorationStates).toEqual(["running"]);
  await page.getByTestId("lyrics-ai-page-back").click();
  await expect(page.getByTestId("ai-translate-panel")).toHaveCount(0);
  await page.getByTestId("lyrics-command-ai").click();
  await expect(page.getByTestId("ai-translate-panel")).toBeVisible();
  await expect(page.getByTestId("lyrics-ai-page-back")).toBeFocused();
  await page.getByTestId("lyrics-ai-page-back").click();

  await page.locator('[data-step-id="export"]').click();
  await expect(page.getByRole("combobox", { name: "Export format" })).toBeVisible();
  const exportButton = page.getByTestId("complete-export-button");
  await expect(exportButton).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportButton.click()
  ]);
  expect(download.suggestedFilename()).toMatch(/\.png$/i);
  expect(await download.path()).not.toBeNull();

  await page.locator('[data-step-id="lyrics"]').click();
  await expect(lyricsEditor).toBeVisible();
  await page.evaluate(() => {
    (window as typeof window & { __LYRIC_CARD_RENDER_COUNTS__?: Record<string, number> })
      .__LYRIC_CARD_RENDER_COUNTS__ = {};
    (window as typeof window & { __ROOT_COMMIT_COUNT__?: number }).__ROOT_COMMIT_COUNT__ = 0;
  });
  const eightyLines = Array.from({ length: 80 }, (_, index) => `Line ${String(index + 1).padStart(2, "0")}`).join("\n");
  await lyricsEditor.fill(eightyLines);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  const renderCounts = await page.evaluate(() => ({
    ...((window as typeof window & { __LYRIC_CARD_RENDER_COUNTS__?: Record<string, number> })
      .__LYRIC_CARD_RENDER_COUNTS__ ?? {})
  }));
  const inputRootCommits = await page.evaluate(() => (
    (window as typeof window & { __ROOT_COMMIT_COUNT__?: number }).__ROOT_COMMIT_COUNT__ ?? 0
  ));
  expect(inputRootCommits).toBeGreaterThan(0);
  expect(renderCounts.LyricEditor ?? 0).toBeGreaterThan(0);
  expect(renderCounts.Stepper ?? 0).toBeGreaterThan(0);
  for (const boundary of retainedBoundaryNames) {
    expect(renderCounts[boundary] ?? 0, `${boundary} rendered for a closed-surface lyric input`).toBe(0);
  }

  console.log(
    `[render-boundaries] initial-dom=${initialDomCount} initial-root-commits=${initialRootCommits} ` +
    `input-root-commits=${inputRootCommits} input-renders=${JSON.stringify(renderCounts)}`
  );
});

test("keeps reduced-motion animation semantics across hidden surface restore", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopFixture(page);
  await page.goto("/");
  const editorSurface = page.getByTestId("editor-surface");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-reduce-motion", "true");
  await page.locator('[data-step-id="lyrics"]').click();
  await page.getByTestId("lyrics-editor-original").fill("First line\nSecond line");
  await page.getByTestId("lyrics-command-ai").click();
  await expect(page.getByTestId("ai-translate-panel")).toBeVisible();
  const visibleWork = await continuousEditorAnimationWork(page);
  expect(visibleWork.runningInfinite).toBe(0);
  expect(visibleWork.aiDecorationNames).toEqual(["none"]);

  await page.getByTestId("examples-button").click();
  await expect(editorSurface).toHaveAttribute("data-surface-work", "paused");
  expect((await continuousEditorAnimationWork(page)).runningInfinite).toBe(0);
  await page.getByTestId("examples-close-button").click();
  await expect(editorSurface).toHaveAttribute("data-surface-work", "running");
  await expect(page.getByTestId("examples-button")).toBeFocused();
  expect((await continuousEditorAnimationWork(page)).aiDecorationNames).toEqual(["none"]);
});

test("bounds React commits for a deterministic 360-chunk AI stream", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopFixture(page);
  await page.goto("/");
  await page.locator('[data-step-id="lyrics"]').click();
  await page.getByTestId("lyrics-editor-original").fill("First line\nSecond line");
  await page.getByTestId("lyrics-command-ai").click();
  await expect(page.getByTestId("ai-translate-panel")).toBeVisible();
  await page.evaluate(() => {
    (window as typeof window & { __LYRIC_CARD_RENDER_COUNTS__?: Record<string, number> })
      .__LYRIC_CARD_RENDER_COUNTS__ = {};
    (window as typeof window & { __ROOT_COMMIT_COUNT__?: number }).__ROOT_COMMIT_COUNT__ = 0;
  });
  await page.getByTestId("confirm-ai-translate").click();
  await expect(page.getByTestId("ai-run-back-to-setup")).toBeVisible();
  await expect(page.getByTestId("ai-translation-stream")).toHaveText(`${"译".repeat(120)}\n${"译".repeat(120)}`);
  const metrics = await page.evaluate(() => ({
    rootCommits: (window as typeof window & { __ROOT_COMMIT_COUNT__?: number }).__ROOT_COMMIT_COUNT__ ?? 0,
    lyricEditorRenders: (window as typeof window & { __LYRIC_CARD_RENDER_COUNTS__?: Record<string, number> })
      .__LYRIC_CARD_RENDER_COUNTS__?.LyricEditor ?? 0
  }));
  expect(metrics.rootCommits).toBeGreaterThan(0);
  expect(metrics.rootCommits).toBeLessThanOrEqual(24);
  expect(metrics.lyricEditorRenders).toBeGreaterThan(0);
  expect(metrics.lyricEditorRenders).toBeLessThanOrEqual(24);
  console.log(`[ai-stream-renders] chunks=360 root-commits=${metrics.rootCommits} lyric-editor-renders=${metrics.lyricEditorRenders}`);
});

async function retainNode(page: Page, key: string, selector: string) {
  await page.evaluate(({ key: retainedKey, selector: retainedSelector }) => {
    const retained = window as typeof window & { __retainedNodes?: Record<string, Element | null> };
    retained.__retainedNodes ??= {};
    retained.__retainedNodes[retainedKey] = document.querySelector(retainedSelector);
  }, { key, selector });
}

async function expectRetainedNode(page: Page, key: string, selector: string) {
  expect(await page.evaluate(({ key: retainedKey, selector: retainedSelector }) => {
    const retained = window as typeof window & { __retainedNodes?: Record<string, Element | null> };
    return retained.__retainedNodes?.[retainedKey] === document.querySelector(retainedSelector);
  }, { key, selector })).toBe(true);
}

async function historyQueryCount(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & { __historyQueries?: number }).__historyQueries ?? 0
  ));
}

async function continuousEditorAnimationWork(page: Page) {
  return page.getByTestId("editor-surface").evaluate((surface) => {
    const decorations = Array.from(surface.querySelectorAll(
      ".ai-translate-trigger__icon"
    ));
    const decorationStyles = decorations.map((element) => getComputedStyle(element));
    return {
      runningInfinite: decorationStyles.filter((style) => (
        style.animationName !== "none" &&
        style.animationIterationCount === "infinite" &&
        style.animationPlayState === "running"
      )).length,
      aiDecorationStates: decorationStyles.map((style) => style.animationPlayState),
      aiDecorationNames: decorationStyles.map((style) => style.animationName)
    };
  });
}
