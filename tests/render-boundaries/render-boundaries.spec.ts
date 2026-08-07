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
  await page.getByTestId("lyrics-ai-page-back").click();
  await expect(page.getByTestId("ai-translate-panel")).toHaveCount(0);
  await page.getByTestId("lyrics-command-ai").click();
  await expect(page.getByTestId("ai-translate-panel")).toBeVisible();
  await expect(page.getByTestId("lyrics-ai-page-back")).toBeFocused();
  await page.getByTestId("lyrics-ai-page-back").click();

  await page.locator('[data-step-id="export"]').click();
  await expect(page.getByRole("radiogroup", { name: "Export format" })).toBeVisible();
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

async function installDesktopFixture(page: Page) {
  await page.addInitScript(() => {
    const userSettings = {
      version: 1,
      sparkCursorEnabled: true,
      reduceMotionEnabled: false,
      uiThemeMode: "album-dynamic",
      uiAcrylicEnabled: false,
      uiFontFamily: "",
      uiAccentMode: "album-dynamic",
      uiAccentPreset: "purple",
      uiCustomAccentColor: "#7C3AED",
      appBackground: {
        mode: "album-dynamic",
        solidColor: "#080910",
        overlayOpacity: 0.46,
        blurAmount: 24
      },
      defaultShowGeneratedWatermark: false,
      defaultShowSharedBy: false,
      defaultSharedByText: "",
      defaultExportFormat: "png",
      defaultExportQuality: "high",
      defaultExportPixelRatio: 2,
      importHistoryLimit: 10,
      firstLaunchLanguageSelected: true
    };
    const preferences = {
      schemaVersion: 2,
      revision: 3,
      updatedAt: 3,
      locale: "en",
      userSettings
    };
    const aiSettings = {
      baseUrl: "https://api.openai.com/v1",
      model: "fixture-model",
      temperature: 0.7,
      defaultStyle: "recommended",
      reasoningEnabled: false,
      promptLibrary: {
        localeOverrides: {},
        hiddenStyleIds: [],
        customPresets: []
      },
      hasApiKey: true
    };
    localStorage.setItem("lyric-card-generator-locale", "en");
    localStorage.setItem("lyric-card-generator-user-settings", JSON.stringify(userSettings));
    localStorage.setItem("lyric-card-generator-app-preferences-v2", JSON.stringify(preferences));

    const fixtureWindow = window as typeof window & {
      __LYRIC_CARD_RENDER_COUNTS__?: Record<string, number>;
      __LYRIC_CARD_RENDER_PROBE__?: (name: string) => void;
      __historyQueries?: number;
      __ROOT_COMMIT_COUNT__?: number;
    };
    fixtureWindow.__LYRIC_CARD_RENDER_COUNTS__ = {};
    fixtureWindow.__LYRIC_CARD_RENDER_PROBE__ = (name) => {
      const counts = fixtureWindow.__LYRIC_CARD_RENDER_COUNTS__ ?? {};
      counts[name] = (counts[name] ?? 0) + 1;
      fixtureWindow.__LYRIC_CARD_RENDER_COUNTS__ = counts;
    };
    fixtureWindow.__historyQueries = 0;
    fixtureWindow.__ROOT_COMMIT_COUNT__ = 0;
    let rendererId = 0;
    Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
      configurable: true,
      value: {
        supportsFiber: true,
        inject: () => {
          rendererId += 1;
          return rendererId;
        },
        onCommitFiberRoot: () => {
          fixtureWindow.__ROOT_COMMIT_COUNT__ = (fixtureWindow.__ROOT_COMMIT_COUNT__ ?? 0) + 1;
        },
        onCommitFiberUnmount: () => undefined,
        onPostCommitFiberRoot: () => undefined
      }
    });
    const desktopFixture = {
      setWindowMaterial: async () => ({ ok: true, applied: "none", reason: "fixture" }),
      minimizeWindow: async () => true,
      toggleMaximizeWindow: async () => ({ maximized: false }),
      closeWindow: async () => true,
      confirmWindowClose: async () => true,
      getWindowState: async () => ({ maximized: false }),
      onWindowStateChanged: () => () => undefined,
      onWindowCloseRequested: () => () => undefined,
      loadAppPreferences: async () => preferences,
      saveAppPreferences: async () => true,
      listSystemFonts: async () => [],
      pickFont: async () => null,
      openExternal: async () => true,
      saveBackgroundImage: async () => null,
      readBackgroundImage: async () => undefined,
      removeBackgroundImage: async () => true,
      registerImportFile: async () => null,
      listImportHistory: async () => {
        fixtureWindow.__historyQueries = (fixtureWindow.__historyQueries ?? 0) + 1;
        return { records: [], total: 0, notice: null };
      },
      getImportHistoryStats: async () => ({ total: 0, version: "fixture" }),
      recordImportHistory: async () => ({ ok: false, code: "fixture" }),
      createManualSave: async () => ({ ok: false, code: "fixture" }),
      updateManualSave: async () => ({ ok: false, code: "fixture" }),
      removeImportHistory: async () => true,
      clearImportHistory: async () => 0,
      replayImportHistory: async () => ({ ok: false, code: "not_found" }),
      relocateImportHistory: async () => ({ ok: false, code: "not_found" }),
      commitImportHistoryReplay: async () => ({ ok: false, code: "not_found" }),
      loadAISettings: async () => aiSettings,
      saveAISettings: async (settings: object) => ({ ...settings, hasApiKey: true }),
      clearAISettingsApiKey: async () => ({ ...aiSettings, hasApiKey: false }),
      startAITranslation: async () => "fixture-request",
      cancelAITranslation: async () => ({ cancelled: true, active: false }),
      onAITranslationChunk: () => () => undefined
    };
    Object.defineProperty(window, "lyricsCardDesktop", {
      configurable: true,
      enumerable: true,
      value: desktopFixture
    });
  });
}

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
