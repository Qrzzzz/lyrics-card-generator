import type { Page } from "@playwright/test";

export async function installDesktopFixture(page: Page) {
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
    type FixtureAIEvent = {
      requestId: string;
      kind: "status" | "reasoning" | "content";
      phase?: "reasoning" | "translating";
      delta?: string;
    };
    let aiChunkListener: ((event: FixtureAIEvent) => void) | null = null;
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
      readImportHistoryFileChunk: async () => ({ ok: false, code: "file_reference_expired" }),
      releaseImportHistoryFile: async () => false,
      commitImportHistoryReplay: async () => ({ ok: false, code: "not_found" }),
      loadActiveEditorDraft: async () => ({ ok: true, data: null }),
      beginEditorDraft: async () => ({
        ok: true,
        data: { recordId: "fixture-draft", token: "fixture-lease" }
      }),
      writeEditorDraft: async () => ({ ok: true, record: null }),
      activateEditorDraft: async () => true,
      saveEditorDraftCover: async () => ({ ok: true, data: "fixture-cover" }),
      loadAISettings: async () => aiSettings,
      saveAISettings: async (settings: object) => ({ ...settings, hasApiKey: true }),
      clearAISettingsApiKey: async () => ({ ...aiSettings, hasApiKey: false }),
      startAITranslation: async (requestId: string, payload: { prompt: string }) => {
        const unitsMarker = "Structured lyric units:\n";
        const unitsOffset = payload.prompt.lastIndexOf(unitsMarker);
        if (unitsOffset < 0) throw new Error("structured lyric units missing from fixture prompt");
        const units = JSON.parse(payload.prompt.slice(unitsOffset + unitsMarker.length)) as Array<{
          id: string;
        }>;
        const finalText = JSON.stringify(
          units.map((unit) => ({
            id: unit.id,
            translation: ["译".repeat(120)]
          }))
        );
        aiChunkListener?.({ requestId, kind: "status", phase: "reasoning" });
        for (let index = 1; index <= 120; index += 1) {
          aiChunkListener?.({ requestId, kind: "reasoning", delta: "思" });
          if (index % 30 === 0) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }
        }
        aiChunkListener?.({ requestId, kind: "status", phase: "translating" });
        for (let index = 0; index < 240; index += 1) {
          const start = Math.floor((index * finalText.length) / 240);
          const end = Math.floor(((index + 1) * finalText.length) / 240);
          aiChunkListener?.({ requestId, kind: "content", delta: finalText.slice(start, end) });
          if ((index + 1) % 30 === 0) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }
        }
        return finalText;
      },
      cancelAITranslation: async () => ({ cancelled: true, active: false }),
      onAITranslationChunk: (callback: (event: FixtureAIEvent) => void) => {
        aiChunkListener = callback;
        return () => {
          if (aiChunkListener === callback) aiChunkListener = null;
        };
      }
    };
    Object.defineProperty(window, "lyricsCardDesktop", {
      configurable: true,
      enumerable: true,
      value: desktopFixture
    });
  });
}
