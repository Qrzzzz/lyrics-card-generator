import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = process.env.LYRICS_CARD_TEST_EXECUTABLE
  ? path.resolve(process.env.LYRICS_CARD_TEST_EXECUTABLE)
  : path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe");
const reportDirectory = path.join(root, "playwright-report", "desktop");
const userDataDirectory = await mkdtemp(path.join(tmpdir(), "lyrics-card-history-desktop-test-"));
const fixtureDirectory = path.join(userDataDirectory, "fixtures");
const audioPath = path.join(fixtureDirectory, "history-audio.m4a");
const relocatedAudioPath = path.join(fixtureDirectory, "history-audio-relocated.mp3");
const rejectedRelocatedAudioPath = path.join(fixtureDirectory, "history-audio-rejected.mp3");
const coverPath = path.join(fixtureDirectory, "history-cover.png");
const coverOnlyPath = path.join(fixtureDirectory, "history-cover-only.png");
const historyPath = path.join(userDataDirectory, "app-data", "import-history.json");
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

let electronApp;
let page;
let dialogDecision = "accept";
let parseSongShouldFail = false;
let resolveShouldFail = false;
let localAudioShouldFail = false;
let nextSongId = 71_000;
const keywordIds = new Map([["same platform song", "70001"]]);
const songsById = new Map();
const rendererDialogs = [];
const nativeDialogs = [];
const routeCounts = { parseSong: 0, resolveSearch: 0, localAudio: 0, imageProxy: 0, remoteCover: 0 };

// Fixtures live under the isolated Electron user-data root so replay, relocation,
// restart, and deletion tests never read or mutate a real user history.
await mkdir(fixtureDirectory, { recursive: true });
await mkdir(reportDirectory, { recursive: true });
const largeAudioFixtureBytes = 3 * 1024 * 1024 + 17;
await writeFile(audioPath, Buffer.alloc(largeAudioFixtureBytes, 0x5a));
await writeFile(coverPath, tinyPng);
await writeFile(coverOnlyPath, tinyPng);

function idForKeyword(keyword) {
  if (!keywordIds.has(keyword)) keywordIds.set(keyword, String(nextSongId++));
  return keywordIds.get(keyword);
}

function songFor(id, fallbackTitle = `History song ${id}`) {
  return songsById.get(id) ?? {
    id,
    title: fallbackTitle,
    artist: `History Artist ${id}`,
    album: `History Album ${id}`,
    pageUrl: `https://music.163.com/song?id=${id}`
  };
}

async function attachRoutes(targetPage) {
  // Route doubles retain stable identities across application restarts, allowing
  // persisted records to be replayed without live music-provider dependencies.
  await targetPage.route("**/api/search-song", async (route) => {
    const body = route.request().postDataJSON();
    const keyword = String(body.keyword ?? "").trim();
    const id = idForKeyword(keyword);
    const song = {
      id,
      title: `${keyword} result`,
      artist: `History Artist ${id}`,
      album: `History Album ${id}`,
      pageUrl: `https://music.163.com/song?id=${id}`
    };
    songsById.set(id, song);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [{
          source: "netease",
          id,
          title: song.title,
          artist: song.artist,
          artists: [song.artist],
          album: song.album,
          durationMs: 180_000,
          pageUrl: song.pageUrl
        }]
      })
    });
  });

  await targetPage.route("**/api/resolve-searched-song", async (route) => {
    routeCounts.resolveSearch += 1;
    const body = route.request().postDataJSON();
    const id = String(body.id ?? "");
    if (resolveShouldFail) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "history remote replay fixture failure" })
      });
      return;
    }
    const song = songFor(id);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          song: {
            title: `Resolved ${song.title}`,
            artist: song.artist,
            album: song.album,
            source: "netease",
            originalUrl: song.pageUrl,
            finalUrl: song.pageUrl
          },
          lyrics: `resolved ${id} line one\nresolved ${id} line two`,
          lyricSource: "netease"
        }
      })
    });
  });

  await targetPage.route("**/api/parse-song", async (route) => {
    routeCounts.parseSong += 1;
    if (parseSongShouldFail) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "history link parse fixture failure" })
      });
      return;
    }
    const body = route.request().postDataJSON();
    const parsed = new URL(String(body.url));
    const id = parsed.searchParams.get("id") || "70001";
    const song = songFor(id, "Link history song");
    songsById.set(id, song);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          title: song.title,
          artist: song.artist,
          album: song.album,
          source: "netease",
          originalUrl: song.pageUrl,
          finalUrl: song.pageUrl,
          lyrics: `link ${id} line one\nlink ${id} line two`
        }
      })
    });
  });

  await targetPage.route("**/api/parse-local-audio", async (route) => {
    routeCounts.localAudio += 1;
    if (localAudioShouldFail) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "history replacement parse fixture failure" })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        status: "success",
        data: {
          title: "Local history fixture",
          artist: "Local Fixture Artist",
          album: "Local Fixture Album",
          source: "unknown",
          originalUrl: "",
          finalUrl: "",
          lyrics: "local fixture line one\nlocal fixture line two"
        }
      })
    });
  });

  await targetPage.route("**/api/image-proxy**", async (route) => {
    routeCounts.imageProxy += 1;
    await route.fulfill({ status: 200, contentType: "image/png", body: tinyPng });
  });
  await targetPage.route("https://covers.example/**", async (route) => {
    routeCounts.remoteCover += 1;
    await route.fulfill({ status: 200, contentType: "image/png", body: tinyPng });
  });
}

async function launchApp({ expectFirstLaunch = false, expectedLocale = null, expectedHistoryLimit = null } = {}) {
  // Re-launching against the same user-data directory is part of the assertion:
  // the on-disk document, not renderer memory, must remain authoritative.
  electronApp = await electron.launch({
    executablePath,
    env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: userDataDirectory },
    timeout: 60_000
  });
  await electronApp.evaluate(({ dialog }, initialDecision) => {
    globalThis.__lyricsCardNativeDialogTest = { defaultDecision: initialDecision, nextDecision: null, calls: [] };
    dialog.showMessageBox = async (_browserWindow, options) => {
      const state = globalThis.__lyricsCardNativeDialogTest;
      const decision = state.nextDecision ?? state.defaultDecision;
      state.nextDecision = null;
      state.calls.push({
        type: options.type,
        title: options.title,
        message: options.message,
        detail: options.detail,
        buttons: options.buttons,
        defaultId: options.defaultId,
        cancelId: options.cancelId,
        noLink: options.noLink
      });
      return {
        response: decision === "accept" ? 0 : (options.cancelId ?? 0),
        checkboxChecked: false
      };
    };
  }, dialogDecision);
  page = await electronApp.firstWindow({ timeout: 60_000 });
  page.on("pageerror", (error) => process.stderr.write(`[history-renderer] ${error.stack || error.message}\n`));
  page.on("dialog", async (dialog) => {
    rendererDialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.dismiss();
  });
  await attachRoutes(page);

  const firstLaunch = page.getByTestId("first-launch-language-dialog");
  if (expectFirstLaunch) {
    await firstLaunch.waitFor({ state: "visible", timeout: 30_000 });
    await page.locator('[data-testid="first-launch-language"][data-locale="en"]').click();
    await firstLaunch.waitFor({ state: "hidden", timeout: 15_000 });
  }
  await page.locator('[data-testid="editor-surface"] [data-testid="history-button"]').waitFor({
    state: "visible",
    timeout: 30_000
  });
  if (expectedLocale !== null && expectedHistoryLimit !== null) {
    await page.waitForFunction(async ({ locale, historyLimit }) => {
      const preferences = await window.lyricsCardDesktop?.loadAppPreferences();
      return document.documentElement.lang === locale
        && preferences?.locale === locale
        && preferences.userSettings?.importHistoryLimit === historyLimit;
    }, { locale: expectedLocale, historyLimit: expectedHistoryLimit }, { timeout: 30_000 });
  }
}

async function setNativeDialogDecision(decision) {
  if (!electronApp) return;
  await electronApp.evaluate((_electron, nextDecision) => {
    globalThis.__lyricsCardNativeDialogTest.nextDecision = nextDecision;
  }, decision);
}

async function readCurrentNativeDialogs() {
  if (!electronApp) return [];
  return electronApp.evaluate(() => globalThis.__lyricsCardNativeDialogTest.calls);
}

async function closeThroughDesktopApi() {
  if (!electronApp) return;
  // Let Playwright request one normal application close. The main process then
  // asks the renderer to flush and confirm; issuing confirm first leaves a
  // second close call racing an application that is already shutting down.
  nativeDialogs.push(...await readCurrentNativeDialogs());
  await closeElectronApplication(electronApp, { label: "desktop-history-regression" });
  electronApp = undefined;
  page = undefined;
}

async function historyTotal() {
  return page.evaluate(async () => (await window.lyricsCardDesktop.getImportHistoryStats()).total);
}

async function waitForHistoryTotal(expected, timeout = 15_000) {
  await page.waitForFunction(async (value) => {
    const api = window.lyricsCardDesktop;
    return Boolean(api) && (await api.getImportHistoryStats()).total === value;
  }, expected, { timeout });
}

async function waitForPersistedHistoryTotal(expected, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let observed = "unreadable";
  while (Date.now() < deadline) {
    try {
      const document = JSON.parse(await readFile(historyPath, "utf8"));
      observed = Array.isArray(document.records) ? document.records.length : "invalid";
      if (observed === expected) return document;
    } catch (error) {
      observed = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`History file did not persist ${expected} record(s) within ${timeout}ms; observed=${observed}`);
}

async function waitForLeadingHistoryKind(expected) {
  await page.waitForFunction(async (kind) => {
    const result = await window.lyricsCardDesktop?.listImportHistory({
      offset: 0,
      limit: 1,
      source: "all"
    });
    return result?.records[0]?.kind === kind;
  }, expected, { timeout: 15_000 });
}

async function manualSaveRecords() {
  return page.evaluate(async () => (await window.lyricsCardDesktop.listImportHistory({
    offset: 0,
    limit: 50,
    source: "manual-save"
  })).records);
}

async function waitForManualSaveState(expected) {
  try {
    await page.waitForFunction((state) => (
      document.querySelector('[data-testid="manual-save-button"]')?.getAttribute("data-manual-save-state") === state
    ), expected, { timeout: 15_000 });
  } catch (error) {
    const actual = await page.getByTestId("manual-save-button").getAttribute("data-manual-save-state").catch(() => null);
    throw new Error(`manual save state did not become ${expected}; actual=${actual}`, { cause: error });
  }
}

async function assertManualSaveEnabledAfterImportFailure(label) {
  const button = page.getByTestId("manual-save-button");
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="manual-save-button"]');
    return node instanceof HTMLButtonElement && !node.disabled && node.dataset.manualSaveState !== "saving";
  }, null, { timeout: 15_000 });
  assert.equal(await button.isDisabled(), false, `${label} settles its document intent`);
}

async function clickManualSave({ rapid = false } = {}) {
  const button = page.getByTestId("manual-save-button");
  if (rapid) {
    await button.evaluate((node) => {
      node.click();
      node.click();
    });
  } else {
    await button.click();
  }
}

async function waitForPreferenceLimit(expected) {
  await page.waitForFunction(async (value) => {
    const preferences = await window.lyricsCardDesktop?.loadAppPreferences();
    return preferences?.userSettings?.importHistoryLimit === value;
  }, expected, { timeout: 15_000 });
}

async function currentSongTitle() {
  return (await page.getByTestId("song-info-summary").locator("dd").first().textContent())?.trim() ?? "";
}

async function waitForHistoryCards(expected, timeout = 30_000) {
  try {
    await page.waitForFunction((expectedCount) => {
      const surface = document.querySelector('[data-testid="history-surface"]');
      return surface?.getAttribute("data-surface-state") === "open"
        && !surface.querySelector('[data-testid="history-loading"]')
        && !surface.querySelector('[data-testid="history-error"]')
        && surface.querySelectorAll("[data-history-kind]").length === expectedCount;
    }, expected, { timeout });
  } catch (error) {
    const diagnostics = await page.evaluate(async () => {
      const surface = document.querySelector('[data-testid="history-surface"]');
      let apiTotal = null;
      let apiError = "";
      let preferenceLimit = null;
      try {
        apiTotal = (await window.lyricsCardDesktop?.getImportHistoryStats())?.total ?? null;
        preferenceLimit = (await window.lyricsCardDesktop?.loadAppPreferences())?.userSettings?.importHistoryLimit ?? null;
      } catch (statsError) {
        apiError = statsError instanceof Error ? statsError.message : String(statsError);
      }
      return {
        surfaceState: surface?.getAttribute("data-surface-state") ?? null,
        cardCount: surface?.querySelectorAll("[data-history-kind]").length ?? 0,
        loading: Boolean(surface?.querySelector('[data-testid="history-loading"]')),
        empty: Boolean(surface?.querySelector('[data-testid="history-empty"]')),
        error: surface?.querySelector('[data-testid="history-error"]')?.textContent?.trim() ?? "",
        resultCount: surface?.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? "",
        query: surface?.querySelector('[data-testid="history-search"]')?.value ?? "",
        source: surface?.querySelector('[data-testid="history-source-filter"]')?.value ?? "",
        apiTotal,
        preferenceLimit,
        apiError
      };
    }).catch((diagnosticError) => ({ diagnosticError: diagnosticError instanceof Error
      ? diagnosticError.message
      : String(diagnosticError) }));
    await page.screenshot({
      path: path.join(reportDirectory, `history-cards-${expected}-failure.png`),
      fullPage: false
    }).catch(() => {});
    const original = error instanceof Error ? error.message : String(error);
    throw new Error(
      `History surface did not settle at ${expected} visible card(s) within ${timeout}ms: ${JSON.stringify(diagnostics)}; ${original}`
    );
  }
}

async function waitForHistoryListPage(expected, timeout = 15_000) {
  await page.waitForFunction(async (expectedCount) => {
    const api = window.lyricsCardDesktop;
    const query = document.querySelector('[data-testid="history-search"]')?.value ?? "";
    const source = document.querySelector('[data-testid="history-source-filter"]')?.value ?? "all";
    if (!api) return false;
    const result = await api.listImportHistory({ offset: 0, limit: 24, query, source });
    return result.records.length === expectedCount;
  }, expected, { polling: 100, timeout });
}

async function openHistory(expectedVisibleCards = null) {
  if (expectedVisibleCards !== null) {
    await waitForHistoryListPage(expectedVisibleCards);
  }
  await page.locator('[data-testid="editor-surface"] [data-testid="history-button"]').click();
  const surface = page.getByTestId("history-surface");
  await surface.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(80);
  if (expectedVisibleCards !== null) {
    await waitForHistoryCards(expectedVisibleCards);
  }
  return surface;
}

async function closeHistoryWithEscape() {
  await page.waitForFunction(() => {
    const closeButton = document.querySelector('[data-testid="history-close-button"]');
    return closeButton instanceof HTMLButtonElement && !closeButton.disabled;
  }, null, { timeout: 15_000 });
  await page.keyboard.press("Escape");
  await page.getByTestId("history-surface").waitFor({ state: "hidden", timeout: 15_000 });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "history-button");
}

async function parseLink(id = "70001") {
  const input = page.getByLabel("Music URL");
  await input.fill(`https://music.163.com/song?id=${id}`);
  await input.press("Enter");
  await page.waitForFunction((songId) => (
    document.querySelector('[data-testid="song-info-summary"]')?.textContent?.includes(`History Artist ${songId}`)
  ), id, { timeout: 15_000 });
}

async function performSearch(keyword, { waitForTotal } = {}) {
  const combobox = page.getByTestId("song-search-primary").getByRole("combobox");
  await combobox.fill(keyword);
  const listbox = page.getByTestId("song-search-listbox");
  await listbox.waitFor({ state: "visible", timeout: 10_000 });
  const option = listbox.getByRole("option").first();
  await option.waitFor({ state: "visible" });
  const id = idForKeyword(keyword);
  await option.click();
  await page.waitForFunction((songId) => (
    document.querySelector('[data-testid="song-info-summary"]')?.textContent?.includes(`History Artist ${songId}`)
  ), id, { timeout: 15_000 });
  if (waitForTotal !== undefined) await waitForHistoryTotal(waitForTotal);
  return id;
}

async function openGeneralSettings() {
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await page.getByTestId("settings-surface").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("settings-tab-general").click();
  await page.locator('[data-settings-panel="general"]:not([hidden])').waitFor({ state: "visible" });
}

async function closeSettings() {
  await page.getByTestId("settings-close-button").click();
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="settings-surface"]')?.getAttribute("data-surface-state") === "closed"
  ), null, { timeout: 15_000 });
}

async function changeHistoryLimit(value, expectedTotal) {
  await openGeneralSettings();
  await page.getByTestId("import-history-limit").selectOption(String(value));
  await waitForPreferenceLimit(value);
  await waitForHistoryTotal(expectedTotal);
  await closeSettings();
}

async function setReducedMotion() {
  await openGeneralSettings();
  const toggle = page.getByTestId("reduce-motion-toggle");
  if (await toggle.getAttribute("aria-checked") !== "true") await toggle.click();
  await page.waitForFunction(() => document.body.getAttribute("data-reduce-motion") === "true");
  await closeSettings();
}

async function replayCard(kind, { relocate = false } = {}) {
  await page.waitForFunction(({ historyKind, useRelocate }) => {
    const card = document.querySelector(
      `[data-testid="history-surface"] [data-history-kind="${historyKind}"]`
    );
    const selector = useRelocate
      ? '[data-testid^="history-relocate-"]'
      : '[data-testid^="history-replay-"]';
    const action = card?.querySelector(selector);
    return action instanceof HTMLButtonElement && action.isConnected && !action.disabled;
  }, { historyKind: kind, useRelocate: relocate }, { timeout: 15_000 });
  const card = page.locator(`[data-testid="history-surface"] [data-history-kind="${kind}"]`).first();
  const action = relocate
    ? card.locator('[data-testid^="history-relocate-"]')
    : card.locator('[data-testid^="history-replay-"]');
  await action.click();
}

async function editManualSong({
  title,
  artist = "Manual History Artist",
  album = "Manual History Album",
  uploadPath = null
}) {
  const aside = page.getByTestId("song-import-aside");
  await page.getByTestId("song-info-toggle").click();
  const editor = aside.getByTestId("song-info-editor");
  await editor.waitFor({ state: "visible" });
  const titleInput = editor.getByLabel("Title");
  const artistInput = editor.getByLabel("Artist");
  const albumInput = editor.getByLabel("Album");
  await titleInput.fill(title);
  await page.waitForTimeout(25);
  await artistInput.fill(artist);
  await page.waitForTimeout(25);
  await albumInput.fill(album);
  await page.waitForTimeout(25);
  assert.deepEqual(
    [await titleInput.inputValue(), await artistInput.inputValue(), await albumInput.inputValue()],
    [title, artist, album],
    "manual metadata inputs settle independently before commit"
  );
  if (uploadPath) {
    await editor.locator('input[type="file"]').setInputFiles(uploadPath);
    await page.waitForFunction(() => {
      const save = document.querySelector('[data-testid="song-info-save"]');
      return save instanceof HTMLButtonElement && !save.disabled;
    });
  }
  await editor.getByTestId("song-info-save").click();
  await aside.getByTestId("song-info-summary").waitFor({ state: "visible" });
  if (title) {
    await page.waitForFunction((expectedTitle) => (
      document.querySelector('[data-testid="song-import-aside"] [data-testid="song-info-summary"] dd')?.textContent?.trim() === expectedTitle
    ), title, { timeout: 15_000 });
  }
}

try {
  await launchApp({ expectFirstLaunch: true });

  const actionIds = await page.locator('[data-testid="editor-header-actions"] > button').evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute("data-testid"))
  );
  assert.deepEqual(
    actionIds,
    ["examples-button", "history-button", "manual-save-button", "clear-all-button", "settings-button"],
    "desktop actions use the required examples/history/manual-save/clear/settings order"
  );
  const manualSaveButton = page.getByTestId("manual-save-button");
  assert.equal(await manualSaveButton.locator("span").count(), 0, "manual save renders no visible text");
  assert.ok((await manualSaveButton.getAttribute("aria-label"))?.trim(), "manual save has an accessible name");
  assert.equal(await manualSaveButton.getAttribute("title"), await manualSaveButton.getAttribute("aria-label"));

  const emptySurface = await openHistory(0);
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "history-close-button");
  assert.equal(await page.getByTestId("editor-surface").getAttribute("aria-hidden"), "true");
  assert.equal(await page.getByTestId("editor-surface").getAttribute("inert"), "");
  assert.match(await emptySurface.getAttribute("class"), /pointer-events-auto/);
  await page.getByTestId("history-empty").waitFor({ state: "visible" });
  await page.getByTestId("history-search").fill("no match");
  await page.getByTestId("history-source-filter").selectOption("local-audio");
  await page.getByTestId("history-empty").waitFor({ state: "visible" });
  await page.getByTestId("history-search").fill("");
  await page.getByTestId("history-source-filter").selectOption("all");
  await closeHistoryWithEscape();
  assert.equal(await emptySurface.getAttribute("aria-hidden"), "true");
  assert.match(await emptySurface.getAttribute("class"), /pointer-events-none/);

  await setReducedMotion();
  const reducedSurface = await openHistory(0);
  assert.equal(await page.locator(".app-shell").getAttribute("data-reduce-motion"), "true");
  const reducedTransform = await reducedSurface.evaluate((node) => getComputedStyle(node).transform);
  assert.ok(reducedTransform === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(reducedTransform), reducedTransform);
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1000, 700, false);
  });
  await page.waitForFunction(() => window.innerWidth >= 998 && window.innerWidth <= 1002);
  const historyBounds = await page.locator(".history-wing__controls").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, viewport: window.innerWidth };
  });
  assert.ok(historyBounds.left >= 0 && historyBounds.right <= historyBounds.viewport + 1, JSON.stringify(historyBounds));
  await closeHistoryWithEscape();

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setMinimumSize(600, 600);
    BrowserWindow.getAllWindows()[0].setContentSize(720, 700, false);
  });
  await page.waitForFunction(() => window.innerWidth >= 718 && window.innerWidth <= 722);
  const compactHeaderBounds = await page.locator('[data-stepper-heading-row="true"]').evaluate((row) => {
    const heading = row.querySelector("h2");
    const actions = row.querySelector('[data-testid="editor-header-actions"]');
    const rowRect = row.getBoundingClientRect();
    const headingRect = heading?.getBoundingClientRect();
    const actionRect = actions?.getBoundingClientRect();
    const buttons = [...(actions?.querySelectorAll("button") ?? [])].map((button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
    });
    return {
      viewport: window.innerWidth,
      row: { left: rowRect.left, right: rowRect.right, top: rowRect.top, bottom: rowRect.bottom },
      heading: headingRect && { left: headingRect.left, right: headingRect.right },
      actions: actionRect && { left: actionRect.left, right: actionRect.right, top: actionRect.top, bottom: actionRect.bottom },
      buttons
    };
  });
  assert.ok(compactHeaderBounds.actions, JSON.stringify(compactHeaderBounds));
  assert.ok(compactHeaderBounds.actions.left >= compactHeaderBounds.heading.right - 1, JSON.stringify(compactHeaderBounds));
  assert.ok(compactHeaderBounds.actions.right <= compactHeaderBounds.viewport + 1, JSON.stringify(compactHeaderBounds));
  assert.ok(compactHeaderBounds.actions.top >= compactHeaderBounds.row.top - 1, JSON.stringify(compactHeaderBounds));
  assert.ok(compactHeaderBounds.actions.bottom <= compactHeaderBounds.row.bottom + 1, JSON.stringify(compactHeaderBounds));
  assert.ok(compactHeaderBounds.buttons.every((button) => button.width <= 37), JSON.stringify(compactHeaderBounds));
  for (let index = 1; index < compactHeaderBounds.buttons.length; index += 1) {
    assert.ok(
      compactHeaderBounds.buttons[index - 1].right <= compactHeaderBounds.buttons[index].left + 0.5,
      JSON.stringify(compactHeaderBounds)
    );
  }
  const compactHistoryButton = page.locator('[data-testid="editor-surface"] [data-testid="history-button"]');
  await compactHistoryButton.focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-testid")),
    "clear-all-button",
    "keyboard navigation skips the unavailable disabled manual-save control"
  );
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1000, 700, false);
    BrowserWindow.getAllWindows()[0].setMinimumSize(1000, 700);
  });
  await page.waitForFunction(() => window.innerWidth >= 998 && window.innerWidth <= 1002);

  assert.equal(
    await page.getByTestId("import-history-limit").evaluate((node) => Boolean(node.closest("[inert]"))),
    true,
    "the desktop-only setting remains isolated while Settings is closed"
  );
  await openGeneralSettings();
  assert.equal(await page.getByTestId("import-history-limit").inputValue(), "10", "default history limit is 10");
  await page.getByTestId("import-history-limit").selectOption("unlimited");
  await waitForPreferenceLimit("unlimited");
  await closeSettings();

  const ipcShapeValidation = await page.evaluate(async () => {
    const api = window.lyricsCardDesktop;
    const bridge = window.lyricsCardDesktopBridge;
    const snapshotFor = (label) => ({
      source: "unknown",
      title: `IPC snapshot ${label}`,
      artist: "Structured clone regression",
      album: "",
      explicit: false,
      originalCoverUrl: "",
      coverUrl: "",
      originalUrl: "",
      finalUrl: "",
      parseMethod: "manual-save-ipc-test",
      lyrics: "Safe lyrics",
      translationText: "",
      translationEnabled: false
    });
    const candidateWithUnknown = (label, value) => {
      const snapshot = snapshotFor(label);
      snapshot.unknownValue = value;
      return { snapshot };
    };

    let publicGetterCalls = 0;
    const accessorCandidate = {};
    Object.defineProperty(accessorCandidate, "snapshot", {
      enumerable: true,
      get() {
        publicGetterCalls += 1;
        return snapshotFor("public accessor");
      }
    });
    let publicProxyGets = 0;
    let publicProxyOwnKeys = 0;
    const proxyCandidate = new Proxy({ snapshot: snapshotFor("public Proxy") }, {
      get(target, key, receiver) {
        publicProxyGets += 1;
        return Reflect.get(target, key, receiver);
      },
      ownKeys(target) {
        publicProxyOwnKeys += 1;
        return Reflect.ownKeys(target);
      }
    });
    const symbolCandidate = { snapshot: snapshotFor("symbol") };
    symbolCandidate.snapshot[Symbol("secret")] = "secret";
    const nonEnumerableCandidate = { snapshot: snapshotFor("non-enumerable") };
    Object.defineProperty(nonEnumerableCandidate.snapshot, "hidden", { value: "secret", enumerable: false });
    const extendedArray = ["safe"];
    extendedArray.extra = "secret";
    const sparseArray = new Array(2);
    sparseArray[1] = "safe";
    const shared = { safe: true };
    const cycle = {};
    cycle.self = cycle;
    const rejectedInputs = [
      ["plain object instead of a canonical string envelope", { snapshot: snapshotFor("plain object") }],
      ["accessor/getter", accessorCandidate],
      ["Proxy", proxyCandidate],
      ["symbol", symbolCandidate],
      ["non-enumerable property", nonEnumerableCandidate],
      ["extended array", candidateWithUnknown("extended array", extendedArray)],
      ["sparse array", candidateWithUnknown("sparse array", sparseArray)],
      ["shared object", candidateWithUnknown("shared object", { first: shared, second: shared })],
      ["ArrayBuffer", candidateWithUnknown("ArrayBuffer", new ArrayBuffer(2 * 1024 * 1024))],
      ["Uint8Array", candidateWithUnknown("Uint8Array", new Uint8Array([1, 2, 3, 4]))],
      ["DataView", candidateWithUnknown("DataView", new DataView(new ArrayBuffer(8)))],
      ["Map", candidateWithUnknown("Map", new Map([["secret", "value"]]))],
      ["Set", candidateWithUnknown("Set", new Set(["secret"]))],
      ["Date", candidateWithUnknown("Date", new Date(0))],
      ["RegExp", candidateWithUnknown("RegExp", /secret/u)],
      ["Error", candidateWithUnknown("Error", new Error("secret"))],
      ["cycle", candidateWithUnknown("cycle", cycle)]
    ];
    if (typeof SharedArrayBuffer === "function") {
      rejectedInputs.push([
        "SharedArrayBuffer",
        candidateWithUnknown("SharedArrayBuffer", new SharedArrayBuffer(16))
      ]);
    }
    const rejected = [];
    for (const [label, input] of rejectedInputs) {
      rejected.push({ label, result: await api.createManualSave(input) });
    }
    const rejectedUpdate = await api.updateManualSave("missing-record", accessorCandidate);

    let bridgeGetterCalls = 0;
    const bridgeAccessorCandidate = {};
    Object.defineProperty(bridgeAccessorCandidate, "snapshot", {
      enumerable: true,
      get() {
        bridgeGetterCalls += 1;
        return snapshotFor("raw contextBridge accessor");
      }
    });
    const bridgeAccessorResult = await bridge.createManualSaveEnvelope(bridgeAccessorCandidate);
    return {
      rejected,
      rejectedUpdate,
      publicGetterCalls,
      publicProxyGets,
      publicProxyOwnKeys,
      bridgeGetterCalls,
      bridgeAccessorResult,
      total: (await api.getImportHistoryStats()).total
    };
  });
  for (const { label, result } of ipcShapeValidation.rejected) {
    assert.deepEqual(result, { ok: false, code: "invalid_snapshot" }, `${label} returns a stable product error`);
  }
  assert.deepEqual(
    ipcShapeValidation.rejectedUpdate,
    { ok: false, code: "invalid_snapshot" },
    "the update product API rejects an object before record lookup or IPC"
  );
  assert.deepEqual(
    {
      publicGetterCalls: ipcShapeValidation.publicGetterCalls,
      publicProxyGets: ipcShapeValidation.publicProxyGets,
      publicProxyOwnKeys: ipcShapeValidation.publicProxyOwnKeys
    },
    { publicGetterCalls: 0, publicProxyGets: 0, publicProxyOwnKeys: 0 },
    "the renderer product service rejects objects before executing getters or Proxy traps"
  );
  assert.equal(
    ipcShapeValidation.bridgeGetterCalls,
    1,
    "the raw contextBridge probe documents Electron's one caller-getter execution before preload"
  );
  assert.deepEqual(
    ipcShapeValidation.bridgeAccessorResult,
    { ok: false, code: "invalid_snapshot" },
    "preload still rejects the clone-erased object without invoking storage"
  );
  assert.equal(ipcShapeValidation.total, 0, "invalid product/bridge calls cause no in-memory mutation");
  await assert.rejects(
    readFile(historyPath, "utf8"),
    (error) => error?.code === "ENOENT",
    "invalid product/bridge calls cause no history file side effect"
  );

  const ipcCanonicalContract = await page.evaluate(async () => {
    const api = window.lyricsCardDesktop;
    const snapshot = {
      source: "unknown",
      title: "Exact canonical IPC contract",
      artist: "Canonical envelope regression",
      album: "",
      explicit: false,
      originalCoverUrl: "",
      coverUrl: "",
      originalUrl: "",
      finalUrl: "",
      parseMethod: "manual-save-ipc-test",
      lyrics: "Safe lyrics",
      translationText: "",
      translationEnabled: false
    };
    const unknownField = { ...snapshot, unsupported: "must reject" };
    const missingArtist = { ...snapshot };
    delete missingArtist.artist;
    const invalidSource = { ...snapshot, source: "attacker-source" };
    const reversedSnapshot = Object.fromEntries(Object.entries(snapshot).reverse());
    const swappedSnapshotEntries = Object.entries(snapshot);
    [swappedSnapshotEntries[1], swappedSnapshotEntries[2]] = [
      swappedSnapshotEntries[2],
      swappedSnapshotEntries[1]
    ];
    const swappedSnapshot = Object.fromEntries(swappedSnapshotEntries);
    const envelopeFor = (candidate) => JSON.stringify({ version: 1, snapshot: candidate });
    const results = [];
    for (const [label, envelope] of [
      ["malformed JSON", '{"version":1,"snapshot":'],
      ["non-canonical whitespace", ` ${envelopeFor(snapshot)}`],
      ["unknown envelope field", JSON.stringify({ version: 1, snapshot, extra: true })],
      ["reordered envelope fields", JSON.stringify({ snapshot, version: 1 })],
      ["unknown snapshot field", envelopeFor(unknownField)],
      ["missing required artist", envelopeFor(missingArtist)],
      ["unsupported source enum", envelopeFor(invalidSource)],
      ["reversed canonical snapshot fields", envelopeFor(reversedSnapshot)],
      ["one swapped canonical snapshot field pair", envelopeFor(swappedSnapshot)]
    ]) {
      results.push({
        label,
        create: await api.createManualSave(envelope),
        update: await api.updateManualSave("missing-record", envelope)
      });
    }
    return { results, total: (await api.getImportHistoryStats()).total };
  });
  for (const { label, create, update } of ipcCanonicalContract.results) {
    assert.deepEqual(create, { ok: false, code: "invalid_snapshot" }, `${label} create is rejected`);
    assert.deepEqual(update, { ok: false, code: "invalid_snapshot" }, `${label} update is rejected before lookup`);
  }
  assert.equal(ipcCanonicalContract.total, 0, "non-canonical envelopes create no in-memory record");
  await assert.rejects(
    readFile(historyPath, "utf8"),
    (error) => error?.code === "ENOENT",
    "non-canonical envelopes create no history file"
  );

  const ipcSnapshotValidation = await page.evaluate(async (maximumBytes) => {
    const api = window.lyricsCardDesktop;
    const snapshotFor = (label) => ({
      source: "unknown",
      title: `IPC snapshot ${label}`,
      artist: "Canonical envelope regression",
      album: "",
      explicit: false,
      originalCoverUrl: "",
      coverUrl: "",
      originalUrl: "",
      finalUrl: "",
      parseMethod: "manual-save-ipc-test",
      lyrics: "Safe lyrics",
      translationText: "",
      translationEnabled: false
    });
    const envelopeFor = (snapshot) => JSON.stringify({ version: 1, snapshot });
    const encoder = new TextEncoder();
    const boundarySnapshot = snapshotFor("legal byte boundary");
    boundarySnapshot.lyrics = "";
    boundarySnapshot.translationText = "";
    let remaining = maximumBytes - encoder.encode(JSON.stringify(boundarySnapshot)).byteLength;
    for (const field of ["lyrics", "translationText"]) {
      const threeByteCharacters = Math.min(120_000, Math.floor(remaining / 3));
      boundarySnapshot[field] = "界".repeat(threeByteCharacters);
      remaining -= threeByteCharacters * 3;
    }
    if (remaining > 0 && boundarySnapshot.translationText.length + remaining <= 120_000) {
      boundarySnapshot.translationText += "x".repeat(remaining);
      remaining = 0;
    }
    const boundaryBytes = encoder.encode(JSON.stringify(boundarySnapshot)).byteLength;
    const legal = await api.createManualSave(envelopeFor(boundarySnapshot));
    boundarySnapshot.translationText += "x";
    const oversized = await api.createManualSave(envelopeFor(boundarySnapshot));
    const deepValue = `${'{"next":'.repeat(25_000)}null${"}".repeat(25_000)}`;
    const deepEnvelope = `{"version":1,"snapshot":{"source":"unknown","title":"Deep input","artist":"","album":"","explicit":false,"originalCoverUrl":"","coverUrl":"","originalUrl":"","finalUrl":"","parseMethod":"","lyrics":"Safe lyrics","translationText":"","translationEnabled":false,"unknownDeep":${deepValue}}}`;
    const deep = await api.createManualSave(deepEnvelope);
    const removed = legal.ok ? await api.removeImportHistory(legal.record.id) : false;
    const total = (await api.getImportHistoryStats()).total;
    return { remaining, boundaryBytes, legal, oversized, deep, removed, total };
  }, 512 * 1024);
  assert.equal(ipcSnapshotValidation.remaining, 0);
  assert.equal(ipcSnapshotValidation.boundaryBytes, 512 * 1024);
  assert.equal(ipcSnapshotValidation.legal.ok, true, "an exact-limit complete legal snapshot crosses IPC successfully");
  assert.deepEqual(
    ipcSnapshotValidation.oversized,
    { ok: false, code: "invalid_snapshot" },
    "a canonical snapshot one byte over the limit has a stable IPC error"
  );
  assert.deepEqual(
    ipcSnapshotValidation.deep,
    { ok: false, code: "invalid_snapshot" },
    "an excessively deep canonical envelope has a stable IPC error"
  );
  assert.equal(ipcSnapshotValidation.removed, true);
  assert.equal(ipcSnapshotValidation.total, 0, "rejected canonical IPC snapshots never mutate history");

  const routeCountsBeforeIdentityIpc = { ...routeCounts };
  const historyDiskBeforeIdentityIpc = await readFile(historyPath, "utf8");
  const identityIpc = await page.evaluate(async () => {
    const api = window.lyricsCardDesktop;
    const snapshotFor = (source, originalUrl, finalUrl = originalUrl) => ({
      source,
      title: `${source} identity archive`,
      artist: "Identity regression",
      album: "",
      explicit: false,
      originalCoverUrl: "",
      coverUrl: "",
      originalUrl,
      finalUrl,
      parseMethod: "manual-save-identity-test",
      lyrics: "Safe lyrics",
      translationText: "",
      translationEnabled: false
    });
    const acceptedCases = [
      [
        "netease",
        "https://music.163.com/song?id=70001&token=SECRET&utm_source=tracker#private",
        "https://music.163.com/song?id=70001"
      ],
      [
        "apple",
        "https://music.apple.com/us/album/example/123456?i=654321&auth=SECRET&signature=SECRET#private",
        "https://music.apple.com/us/album/example/123456?i=654321"
      ],
      [
        "qq",
        "https://y.qq.com/portal/player.html?songmid=003OUlho2HcRHC&api_key=SECRET&utm_campaign=tracker#private",
        "https://y.qq.com/portal/player.html?songmid=003OUlho2HcRHC"
      ],
      [
        "qq",
        "https://y.qq.com/account/settings?songmid=003OUlho2HcRHC&token=SECRET#private",
        "https://y.qq.com/account/settings"
      ],
      [
        "spotify",
        "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=SECRET&utm_source=tracker#private",
        "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
      ],
      [
        "netease",
        "https://music.163.com/song?ID=70001",
        "https://music.163.com/song"
      ],
      [
        "netease",
        "https://music.163.com:8443/song?id=70001",
        "https://music.163.com:8443/song"
      ],
      [
        "netease",
        "https://unexpected.music.163.com/song?id=70001",
        "https://unexpected.music.163.com/song"
      ]
    ];
    const accepted = [];
    for (const [source, inputUrl, expected] of acceptedCases) {
      const envelope = JSON.stringify({
        version: 1,
        snapshot: snapshotFor(source, inputUrl)
      });
      const created = await api.createManualSave(envelope);
      const replay = created.ok ? await api.replayImportHistory(created.record.id) : created;
      const removed = created.ok ? await api.removeImportHistory(created.record.id) : false;
      accepted.push({ source, expected, created, replay, removed });
    }
    const ambiguousCases = [
      ["duplicate NetEase identity", "netease", "https://music.163.com/song?id=70001&id=70002"],
      ["encoded duplicate NetEase identity", "netease", "https://music.163.com/song?id=70001&%69d=70002"],
      ["same-value case duplicate", "netease", "https://music.163.com/song?id=70001&ID=70001"],
      ["conflicting case duplicate", "netease", "https://music.163.com/song?id=70001&ID=70002"],
      ["percent-decoded case duplicate", "netease", "https://music.163.com/song?id=70001&%49%44=70002"],
      ["QQ songmid case duplicate", "qq", "https://y.qq.com/portal/player.html?songmid=003OUlho2HcRHC&SongMid=003OUlho2HcRHC"],
      ["QQ songid case conflict", "qq", "https://y.qq.com/player?songid=70001&SONGID=70002"],
      ["Apple case duplicate", "apple", "https://music.apple.com/us/album/example/123456?i=654321&I=654321"],
      ["QQ path/query conflict", "qq", "https://y.qq.com/n/ryqq/songDetail/003OUlho2HcRHC?songmid=OTHERID"],
      ["Apple path/query conflict", "apple", "https://music.apple.com/us/song/example/654322?i=654323"],
      [
        "ambiguous original with canonical final",
        "netease",
        "https://music.163.com/song?id=70001&ID=70002",
        "https://music.163.com/song?id=70002"
      ],
      [
        "canonical original with ambiguous final",
        "netease",
        "https://music.163.com/song?id=70001",
        "https://music.163.com/song?id=70001&%69d=70002"
      ]
    ];
    const rejected = [];
    for (const [label, source, originalUrl, finalUrl = originalUrl] of ambiguousCases) {
      const envelope = JSON.stringify({
        version: 1,
        snapshot: snapshotFor(source, originalUrl, finalUrl)
      });
      rejected.push({
        label,
        create: await api.createManualSave(envelope),
        update: await api.updateManualSave("missing-record", envelope)
      });
    }
    const conflict = await api.createManualSave(JSON.stringify({
      version: 1,
      snapshot: snapshotFor(
        "netease",
        "https://music.163.com/song?id=70001",
        "https://music.163.com/song?id=70002"
      )
    }));
    return { accepted, rejected, conflict, total: (await api.getImportHistoryStats()).total };
  });
  for (const { source, expected, created, replay, removed } of identityIpc.accepted) {
    assert.equal(created.ok, true, `${source} identity fixture is accepted through the product API`);
    assert.equal(replay.ok, true, `${source} identity fixture replays through packaged IPC`);
    assert.equal(replay.snapshot.originalUrl, expected, `${source} original URL keeps only safe identity`);
    assert.equal(replay.snapshot.finalUrl, expected, `${source} final URL keeps only safe identity`);
    assert.doesNotMatch(JSON.stringify(replay.snapshot), /SECRET|token=|api_key=|auth=|signature=|utm_|#|\bsi=/i);
    assert.equal(removed, true);
  }
  for (const { label, create, update } of identityIpc.rejected) {
    assert.deepEqual(create, { ok: false, code: "invalid_snapshot" }, `${label} create is rejected`);
    assert.deepEqual(update, { ok: false, code: "invalid_snapshot" }, `${label} update is rejected before lookup`);
  }
  assert.deepEqual(
    identityIpc.conflict,
    { ok: false, code: "invalid_snapshot" },
    "packaged IPC rejects conflicting original/final song identities"
  );
  assert.equal(identityIpc.total, 0);
  assert.equal(
    await readFile(historyPath, "utf8"),
    historyDiskBeforeIdentityIpc,
    "ambiguous identity create/update attempts leave packaged history bytes unchanged"
  );
  assert.deepEqual(routeCounts, routeCountsBeforeIdentityIpc, "identity-only IPC replay performs no network request");

  for (let index = 0; index < 10; index += 1) {
    const ordered = await page.evaluate(async (sequence) => {
      const api = window.lyricsCardDesktop;
      const createPromise = api.createManualSave(JSON.stringify({
        version: 1,
        snapshot: {
          source: "unknown",
          title: `Ordered create ${sequence}`,
          artist: "Queue regression",
          album: "",
          explicit: false,
          originalCoverUrl: "",
          coverUrl: "",
          originalUrl: "",
          finalUrl: "",
          parseMethod: "manual-save-ordering-test",
          lyrics: `ordered create ${sequence}`,
          translationText: "",
          translationEnabled: false
        }
      }));
      const clearPromise = api.clearImportHistory();
      const [create, cleared] = await Promise.all([createPromise, clearPromise]);
      return { create, cleared, total: (await api.getImportHistoryStats()).total };
    }, index);
    assert.equal(ordered.create.ok, true, `ordered create ${index} succeeds`);
    assert.equal(ordered.cleared, 1, `clear ${index} observes the preceding create`);
    assert.equal(ordered.total, 0, `clear ${index} is the durable ordering boundary`);
  }

  const updateOrdering = await page.evaluate(async () => {
    const api = window.lyricsCardDesktop;
    const created = await api.createManualSave(JSON.stringify({
      version: 1,
      snapshot: {
        source: "unknown",
        title: "Ordered update seed",
        artist: "Queue regression",
        album: "",
        explicit: false,
        originalCoverUrl: "",
        coverUrl: "",
        originalUrl: "",
        finalUrl: "",
        parseMethod: "manual-save-ordering-test",
        lyrics: "before ordered update",
        translationText: "",
        translationEnabled: false
      }
    }));
    if (!created.ok) return { created, update: null, cleared: -1, total: -1 };
    const updatePromise = api.updateManualSave(created.record.id, JSON.stringify({
      version: 1,
      snapshot: {
        source: "unknown",
        title: "Ordered update committed",
        artist: "Queue regression",
        album: "",
        explicit: false,
        originalCoverUrl: "",
        coverUrl: "",
        originalUrl: "",
        finalUrl: "",
        parseMethod: "manual-save-ordering-test",
        lyrics: "after ordered update",
        translationText: "",
        translationEnabled: false
      }
    }));
    const clearPromise = api.clearImportHistory();
    const [update, cleared] = await Promise.all([updatePromise, clearPromise]);
    return { created, update, cleared, total: (await api.getImportHistoryStats()).total };
  });
  assert.equal(updateOrdering.created.ok, true);
  assert.equal(updateOrdering.update?.ok, true, "ordered update completes before the following clear");
  assert.equal(updateOrdering.cleared, 1, "clear observes the preceding update record");
  assert.equal(updateOrdering.total, 0, "an update cannot cross and survive the clear boundary");

  await waitForManualSaveState("unavailable");
  assert.equal(await manualSaveButton.isDisabled(), true, "an unavailable manual save is a genuinely disabled control");
  await manualSaveButton.evaluate((node) => node.click());
  await page.waitForTimeout(120);
  assert.equal(await historyTotal(), 0, "the default blank document cannot create a manual save");

  await editManualSong({ title: "Manual archive original" });
  await waitForManualSaveState("create");
  await clickManualSave({ rapid: true });
  await waitForHistoryTotal(1);
  await waitForManualSaveState("current");
  let manualRecords = await manualSaveRecords();
  assert.equal(manualRecords.length, 1, "a rapid double click creates exactly one manual save");
  const firstManualId = manualRecords[0].id;
  let manualDocument = JSON.parse(await readFile(historyPath, "utf8"));
  assert.equal(manualDocument.schemaVersion, 2);
  const firstManualInternal = manualDocument.records.find((record) => record.id === firstManualId);
  assert.equal(firstManualInternal?.kind, "manual-save");
  assert.equal(firstManualInternal?.snapshot?.title, "Manual archive original");
  const firstManualCreatedAt = firstManualInternal.createdAt;
  const unchangedDisk = await readFile(historyPath, "utf8");
  await clickManualSave();
  await page.getByTestId("app-toast").filter({ hasText: "already up to date" }).waitFor({
    state: "visible",
    timeout: 15_000
  });
  await page.waitForTimeout(120);
  assert.equal(await readFile(historyPath, "utf8"), unchangedDisk, "an unchanged document does not write history");

  await editManualSong({ title: "Manual archive updated" });
  await waitForManualSaveState("update");
  await clickManualSave();
  await waitForManualSaveState("current");
  manualRecords = await manualSaveRecords();
  assert.equal(manualRecords.length, 1);
  assert.equal(manualRecords[0].id, firstManualId, "editing updates the bound manual save ID");
  manualDocument = JSON.parse(await readFile(historyPath, "utf8"));
  const updatedManualInternal = manualDocument.records.find((record) => record.id === firstManualId);
  assert.equal(updatedManualInternal.createdAt, firstManualCreatedAt, "manual updates retain createdAt");
  assert.ok(updatedManualInternal.lastUsedAt >= firstManualInternal.lastUsedAt);
  assert.equal(updatedManualInternal.snapshot.title, "Manual archive updated");

  const replayFixtureUpdate = await page.evaluate(async ({ recordId }) => (
    window.lyricsCardDesktop.updateManualSave(recordId, JSON.stringify({
      version: 1,
      snapshot: {
        source: "netease",
        title: "Manual archive updated",
        artist: "Manual History Artist",
        album: "Manual History Album",
        explicit: true,
        originalCoverUrl: "https://covers.example/manual-replay.png?token=DO_NOT_PERSIST",
        coverUrl: "https://covers.example/manual-replay.png?api_key=DO_NOT_PERSIST",
        originalUrl: "https://music.163.com/#/song?id=70001&token=DO_NOT_PERSIST",
        finalUrl: "https://music.163.com/song?id=70001&api_key=DO_NOT_PERSIST",
        parseMethod: "manual-save-replay-fixture",
        lyrics: "manual replay line one\nmanual replay line two",
        translationText: "",
        translationEnabled: true
      }
    }))
  ), { recordId: firstManualId });
  assert.equal(replayFixtureUpdate.ok, true);
  manualDocument = JSON.parse(await readFile(historyPath, "utf8"));
  const replayFixtureInternal = manualDocument.records.find((record) => record.id === firstManualId);
  assert.equal(replayFixtureInternal.snapshot.translationEnabled, true);
  assert.equal(replayFixtureInternal.snapshot.translationText, "");
  assert.equal(
    replayFixtureInternal.snapshot.originalUrl,
    "https://music.163.com/song?id=70001",
    "manual-save storage retains the NetEase song identity while removing credentials"
  );
  assert.equal(
    replayFixtureInternal.snapshot.finalUrl,
    "https://music.163.com/song?id=70001",
    "different representations of one song collapse to identical replay provenance"
  );
  assert.doesNotMatch(JSON.stringify(replayFixtureInternal.snapshot), /DO_NOT_PERSIST|token=|api_key=/);

  await closeThroughDesktopApi();
  await launchApp({ expectedLocale: "en", expectedHistoryLimit: "unlimited" });
  await waitForHistoryTotal(1);
  const manualRestartSurface = await openHistory(1);
  const restartedManualCard = manualRestartSurface.locator('[data-history-kind="manual-save"]');
  assert.equal(await restartedManualCard.count(), 1, "manual saves survive a desktop restart");
  assert.match(await restartedManualCard.textContent(), /Manual archive updated/);
  assert.equal(await restartedManualCard.locator('[data-testid^="history-relocate-"]').count(), 0);
  assert.match(await restartedManualCard.locator('[data-testid^="history-replay-"]').textContent(), /Load save/i);
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="history-surface"] [data-history-kind="manual-save"] img');
    return image instanceof HTMLImageElement && image.complete;
  }, null, { timeout: 15_000 });
  const routeCountsBeforeManualReplay = { ...routeCounts };
  await replayCard("manual-save");
  await manualRestartSurface.waitFor({ state: "hidden", timeout: 15_000 });
  const replayedCover = page.getByTestId("song-import-cover").locator("img");
  await replayedCover.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="song-import-cover"] img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  }, null, { timeout: 15_000 });
  const replayedCoverSrc = await replayedCover.getAttribute("src");
  assert.ok(replayedCoverSrc, "manual-save replay renders a cover image");
  const restoredCoverUrl = new URL(replayedCoverSrc, "http://localhost").searchParams.get("url");
  assert.ok(restoredCoverUrl, "manual-save replay routes the archived cover through the image proxy");
  const restoredCover = new URL(restoredCoverUrl);
  assert.equal(
    `${restoredCover.origin}${restoredCover.pathname}`,
    "https://covers.example/manual-replay.png",
    "manual-save replay restores the sanitized archived cover origin and path"
  );
  assert.equal(restoredCover.searchParams.get("param"), "1000y1000", "manual-save replay applies the existing high-resolution cover normalization");
  assert.equal(restoredCover.searchParams.has("token"), false, "manual-save replay does not restore stripped cover tokens");
  assert.equal(restoredCover.searchParams.has("api_key"), false, "manual-save replay does not restore stripped cover API keys");
  assert.equal(routeCounts.parseSong, routeCountsBeforeManualReplay.parseSong, "manual-save cover restoration does not reparse the song URL");
  assert.equal(routeCounts.resolveSearch, routeCountsBeforeManualReplay.resolveSearch, "manual-save cover restoration does not resolve search again");
  assert.equal(routeCounts.localAudio, routeCountsBeforeManualReplay.localAudio, "manual-save cover restoration does not parse local audio again");
  assert.equal(routeCounts.remoteCover, routeCountsBeforeManualReplay.remoteCover, "manual-save cover restoration never requests the remote cover directly");
  assert.equal(await currentSongTitle(), "Manual archive updated");
  await waitForManualSaveState("current");

  const linkInput = page.getByLabel("Music URL");
  const replayUrl = await linkInput.inputValue();
  assert.equal(
    replayUrl,
    "https://music.163.com/song?id=70001",
    "manual replay retains its exact sanitized song identity"
  );
  await editManualSong({ title: "Manual replay local edit" });
  await waitForManualSaveState("update");
  const routeCountsBeforeManualReplayRemount = { ...routeCounts };
  for (let roundTrip = 1; roundTrip <= 2; roundTrip += 1) {
    await page.getByTestId("stepper-next-button").click();
    const replayLyrics = page.getByTestId("lyrics-editor-original");
    await replayLyrics.waitFor({ state: "visible", timeout: 15_000 });
    assert.equal(
      await replayLyrics.inputValue(),
      "manual replay line one\nmanual replay line two",
      `manual replay lyrics survive song-import remount ${roundTrip}`
    );
    await page.getByTestId("stepper-back-button").click();
    await linkInput.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(350);
    assert.equal(routeCounts.parseSong, routeCountsBeforeManualReplayRemount.parseSong, `manual replay does not reparse the song across remount ${roundTrip}`);
    assert.equal(routeCounts.resolveSearch, routeCountsBeforeManualReplayRemount.resolveSearch, `manual replay does not resolve search across remount ${roundTrip}`);
    assert.equal(routeCounts.localAudio, routeCountsBeforeManualReplayRemount.localAudio, `manual replay does not parse local audio across remount ${roundTrip}`);
    assert.equal(routeCounts.remoteCover, routeCountsBeforeManualReplayRemount.remoteCover, `manual replay keeps cover remounts behind the image proxy ${roundTrip}`);
    assert.equal(await currentSongTitle(), "Manual replay local edit", `manual replay document survives remount ${roundTrip}`);
    assert.equal(await linkInput.inputValue(), replayUrl, `manual replay URL survives remount ${roundTrip}`);
    await waitForManualSaveState("update");
  }
  manualRecords = await manualSaveRecords();
  assert.equal(manualRecords.length, 1);
  assert.equal(manualRecords[0].id, firstManualId, "manual replay remount retains the original update binding");

  const routeCountsBeforeExplicitUrlImport = { ...routeCounts };
  await linkInput.fill("https://music.163.com/song?id=79992");
  assert.deepEqual(routeCounts, routeCountsBeforeExplicitUrlImport, "editing the replay URL alone performs no request");
  await page.getByTestId("stepper-next-button").click();
  await page.getByTestId("lyrics-editor-original").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("stepper-back-button").click();
  await linkInput.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="song-info-summary"]')?.textContent?.includes("History Artist 79992")
  ), null, { timeout: 15_000 });
  assert.equal(
    routeCounts.parseSong,
    routeCountsBeforeExplicitUrlImport.parseSong + 1,
    "an explicit URL edit restores exactly one normal auto-parse request on the next mount"
  );
  assert.equal(routeCounts.resolveSearch, routeCountsBeforeExplicitUrlImport.resolveSearch, "the explicit URL import does not resolve search");
  assert.equal(routeCounts.localAudio, routeCountsBeforeExplicitUrlImport.localAudio, "the explicit URL import does not parse local audio");
  assert.equal(routeCounts.remoteCover, routeCountsBeforeExplicitUrlImport.remoteCover, "the explicit URL import does not request the archived cover directly");
  assert.notEqual(await currentSongTitle(), "Manual replay local edit", "the explicit URL import may replace the replayed snapshot");
  await waitForManualSaveState("create");
  manualRecords = await manualSaveRecords();
  assert.equal(manualRecords.length, 1);
  assert.equal(manualRecords[0].id, firstManualId, "the explicit import detaches without rewriting the archived record");
  await waitForHistoryTotal(2);
  const [explicitLinkRecord] = await page.evaluate(async () => (await window.lyricsCardDesktop.listImportHistory({
    offset: 0,
    limit: 10,
    source: "link"
  })).records);
  assert.ok(explicitLinkRecord?.id, "the explicit URL import records a normal link history entry");
  assert.equal(await page.evaluate(
    (recordId) => window.lyricsCardDesktop.removeImportHistory(recordId),
    explicitLinkRecord.id
  ), true);
  await waitForHistoryTotal(1);

  const reboundManualSurface = await openHistory(1);
  const routeCountsBeforeManualRebind = { ...routeCounts };
  await replayCard("manual-save");
  await reboundManualSurface.waitFor({ state: "hidden", timeout: 15_000 });
  await page.waitForTimeout(350);
  assert.equal(routeCounts.parseSong, routeCountsBeforeManualRebind.parseSong, "replaying the archive again restores provenance without reparsing the song");
  assert.equal(routeCounts.resolveSearch, routeCountsBeforeManualRebind.resolveSearch, "replaying the archive again does not resolve search");
  assert.equal(routeCounts.localAudio, routeCountsBeforeManualRebind.localAudio, "replaying the archive again does not parse local audio");
  assert.equal(routeCounts.remoteCover, routeCountsBeforeManualRebind.remoteCover, "replaying the archive again keeps the cover behind the image proxy");
  assert.equal(await currentSongTitle(), "Manual archive updated");
  await waitForManualSaveState("current");

  const titleBeforeImportFailures = await currentSongTitle();
  const linkSection = linkInput.locator("xpath=ancestor::section[1]");
  parseSongShouldFail = true;
  await linkInput.fill("https://music.163.com/song?id=79991");
  await linkInput.press("Enter");
  await linkSection.locator('[role="status"].status-danger').waitFor({ state: "visible", timeout: 15_000 });
  parseSongShouldFail = false;
  await assertManualSaveEnabledAfterImportFailure("link parse failure");
  assert.equal(
    await page.getByTestId("manual-save-button").getAttribute("data-manual-save-state"),
    "update",
    "a failed link parse preserves the loaded manual-save binding"
  );
  assert.equal(await currentSongTitle(), titleBeforeImportFailures);

  resolveShouldFail = true;
  const failedSearchInput = page.getByTestId("song-search-primary").getByRole("combobox");
  await failedSearchInput.fill("manual archive failed search");
  const failedSearchListbox = page.getByTestId("song-search-listbox");
  await failedSearchListbox.waitFor({ state: "visible", timeout: 15_000 });
  await failedSearchListbox.getByRole("option").first().click();
  await page.getByTestId("song-search-primary")
    .locator('[role="status"].status-danger')
    .filter({ hasText: "history remote replay fixture failure" })
    .waitFor({
      state: "attached",
      timeout: 15_000
    });
  resolveShouldFail = false;
  await assertManualSaveEnabledAfterImportFailure("search resolve failure");
  assert.equal(
    await page.getByTestId("manual-save-button").getAttribute("data-manual-save-state"),
    "update",
    "a failed search resolve preserves the loaded manual-save binding"
  );
  assert.equal(await currentSongTitle(), titleBeforeImportFailures);

  localAudioShouldFail = true;
  const failedLocalInput = page.locator('input[accept*=".m4a"]');
  const failedLocalSection = failedLocalInput.locator("xpath=ancestor::section[1]");
  await failedLocalInput.setInputFiles(audioPath);
  await failedLocalSection.locator('[role="status"].status-danger').waitFor({ state: "visible", timeout: 15_000 });
  localAudioShouldFail = false;
  await assertManualSaveEnabledAfterImportFailure("local audio parse failure");
  assert.equal(
    await page.getByTestId("manual-save-button").getAttribute("data-manual-save-state"),
    "update",
    "a failed local-audio parse preserves the loaded manual-save binding"
  );
  assert.equal(await currentSongTitle(), titleBeforeImportFailures);

  await editManualSong({ title: "Manual archive replay update" });
  await waitForManualSaveState("update");
  await clickManualSave();
  await waitForManualSaveState("current");
  manualRecords = await manualSaveRecords();
  assert.equal(manualRecords.length, 1);
  assert.equal(manualRecords[0].id, firstManualId, "a loaded manual save remains bound for updates");

  assert.equal(
    await page.evaluate((recordId) => window.lyricsCardDesktop.removeImportHistory(recordId), firstManualId),
    true
  );
  await waitForHistoryTotal(0);
  await editManualSong({ title: "Stale binding recovery" });
  await clickManualSave();
  await page.getByTestId("app-toast").filter({ hasText: "Original save missing" }).waitFor({
    state: "visible",
    timeout: 15_000
  });
  await waitForManualSaveState("create");
  assert.equal(await historyTotal(), 0, "not-found does not silently create a replacement in the same click");
  await clickManualSave();
  await waitForHistoryTotal(1);
  await waitForManualSaveState("current");
  manualRecords = await manualSaveRecords();
  assert.notEqual(manualRecords[0].id, firstManualId, "the next explicit save creates a new record after not-found");

  const boundDeleteSurface = await openHistory(1);
  await boundDeleteSurface.locator('[data-history-kind="manual-save"] [data-testid^="history-remove-"]').click();
  await waitForHistoryTotal(0);
  await closeHistoryWithEscape();
  await waitForManualSaveState("create");
  await clickManualSave();
  await waitForHistoryTotal(1);
  await waitForManualSaveState("current");

  await openHistory(1);
  await page.getByTestId("history-clear-all").click();
  await waitForHistoryTotal(0);
  await closeHistoryWithEscape();
  await waitForManualSaveState("create");
  await clickManualSave();
  await waitForHistoryTotal(1);
  await waitForManualSaveState("current");

  await openHistory(1);
  await page.getByTestId("history-clear-all").click();
  await waitForHistoryTotal(0);
  await closeHistoryWithEscape();

  const emptyTranslationFixture = await page.evaluate(async () => (
    window.lyricsCardDesktop.createManualSave(JSON.stringify({
      version: 1,
      snapshot: {
        source: "unknown",
        title: "Empty translation roundtrip",
        artist: "Manual History Artist",
        album: "",
        explicit: false,
        originalCoverUrl: "",
        coverUrl: "",
        originalUrl: "",
        finalUrl: "",
        parseMethod: "manual-save-translation-fixture",
        lyrics: "empty translation line",
        translationText: "",
        translationEnabled: true
      }
    }))
  ));
  assert.equal(emptyTranslationFixture.ok, true);
  await waitForHistoryTotal(1);
  const emptyTranslationSurface = await openHistory(1);
  await replayCard("manual-save");
  await emptyTranslationSurface.waitFor({ state: "hidden", timeout: 15_000 });
  await page.getByTestId("stepper-next-button").click();
  await page.getByTestId("lyrics-editor-columns").waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(
    await page.getByTestId("lyrics-editor-columns").getAttribute("data-bilingual"),
    "true",
    "manual replay preserves translationEnabled=true even when the translation text is empty"
  );
  assert.equal(await page.getByTestId("lyrics-editor-translation").inputValue(), "");
  await page.getByTestId("stepper-back-button").click();
  await openHistory(1);
  await page.getByTestId("history-clear-all").click();
  await waitForHistoryTotal(0);
  await closeHistoryWithEscape();

  await parseLink("70991");
  await waitForHistoryTotal(1);
  const ordinaryReplaySurface = await openHistory(1);
  await replayCard("link");
  await ordinaryReplaySurface.waitFor({ state: "hidden", timeout: 15_000 });
  await waitForManualSaveState("create");
  await clickManualSave();
  await waitForHistoryTotal(2);
  const ordinaryReplayRecords = await page.evaluate(async () => (await window.lyricsCardDesktop.listImportHistory({
    offset: 0,
    limit: 10,
    source: "all"
  })).records);
  assert.deepEqual(
    ordinaryReplayRecords.map((record) => record.kind).sort(),
    ["link", "manual-save"],
    "saving after an ordinary history replay creates a manual save and retains the source record"
  );
  await openHistory(2);
  await page.getByTestId("history-clear-all").click();
  await waitForHistoryTotal(0);
  await closeHistoryWithEscape();

  await parseLink();
  await waitForHistoryTotal(1);
  const linkSurface = await openHistory(1);
  assert.equal(await linkSurface.locator('[data-history-kind="link"]').count(), 1, "successful link parsing is recorded");
  await closeHistoryWithEscape();

  await performSearch("same platform song", { waitForTotal: 1 });
  await waitForLeadingHistoryKind("search");
  const upsertSurface = await openHistory(1);
  assert.equal(await upsertSurface.locator('[data-history-kind="search"]').count(), 1, "the matching platform song is upserted");
  await closeHistoryWithEscape();
  await performSearch("same platform song", { waitForTotal: 1 });

  const replaySurface = await openHistory(1);
  const beforeCancelledReplay = await currentSongTitle();
  await setNativeDialogDecision("dismiss");
  await replayCard("search");
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="history-surface"] [data-testid^="history-replay-"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  assert.equal(await replaySurface.getAttribute("data-surface-state"), "open", "replacement cancellation keeps history open");
  assert.equal(await currentSongTitle(), beforeCancelledReplay, "replacement cancellation preserves the document");
  await replayCard("search");
  await replaySurface.waitFor({ state: "hidden", timeout: 15_000 });
  await waitForHistoryTotal(1);

  for (let index = 2; index <= 26; index += 1) {
    await performSearch(`history batch ${index}`, { waitForTotal: index });
  }
  const pagedSurface = await openHistory(24);
  assert.equal(await historyTotal(), 26);
  await page.getByTestId("history-load-more").click();
  await page.waitForFunction(() => (
    document.querySelectorAll('[data-testid="history-surface"] [data-history-kind]').length === 26
  ));
  await closeHistoryWithEscape();

  await setNativeDialogDecision("dismiss");
  await openGeneralSettings();
  await page.getByTestId("import-history-limit").selectOption("10");
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId("import-history-limit").inputValue(), "unlimited");
  assert.equal(await historyTotal(), 26, "cancelling a destructive limit change preserves all records");
  await closeSettings();

  await changeHistoryLimit(10, 10);
  await changeHistoryLimit(5, 5);
  assert.ok(
    (await readCurrentNativeDialogs()).some(({ message, detail }) => /delete|remove|删除|刪除/i.test(`${message} ${detail}`)),
    "lowering a history limit shows an explicit destructive confirmation"
  );
  assert.deepEqual(rendererDialogs, [], `history interactions must not use renderer dialogs: ${JSON.stringify(rendererDialogs)}`);
  await changeHistoryLimit("unlimited", 5);
  await performSearch("unlimited extra one", { waitForTotal: 6 });
  await performSearch("unlimited extra two", { waitForTotal: 7 });

  const deletionSurface = await openHistory(7);
  await deletionSurface.locator('[data-testid^="history-remove-"]').first().click();
  await waitForHistoryTotal(6);
  await page.waitForFunction(() => (
    document.querySelectorAll('[data-testid="history-surface"] [data-history-kind]').length === 6
  ));
  await page.getByTestId("history-clear-all").click();
  await waitForHistoryTotal(0);
  await page.getByTestId("history-empty").waitFor({ state: "visible" });
  await closeHistoryWithEscape();

  await performSearch("restart persistence", { waitForTotal: 1 });
  const persistedBeforeRestart = await waitForPersistedHistoryTotal(1);
  assert.equal(persistedBeforeRestart.schemaVersion, 2);
  assert.equal(persistedBeforeRestart.records.length, 1);
  await closeThroughDesktopApi();

  await launchApp({ expectedLocale: "en", expectedHistoryLimit: "unlimited" });
  await waitForHistoryTotal(1);
  const persistedSurface = await openHistory(1);
  assert.match(await persistedSurface.textContent(), /restart persistence/i, "history survives a desktop restart");
  resolveShouldFail = true;
  const blankBeforeRemoteFailure = await currentSongTitle();
  await replayCard("search");
  await page.getByTestId("app-toast").filter({ hasText: "current document unchanged" }).waitFor({
    state: "visible",
    timeout: 15_000
  });
  assert.equal(await persistedSurface.getAttribute("data-surface-state"), "open", "remote replay failure keeps history open");
  assert.equal(await currentSongTitle(), blankBeforeRemoteFailure, "remote replay failure preserves the current document");
  resolveShouldFail = false;
  await closeHistoryWithEscape();

  await page.locator('input[accept*=".m4a"]').setInputFiles(audioPath);
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="song-info-summary"]')?.textContent?.includes("Local history fixture")
  ), null, { timeout: 15_000 });
  await waitForHistoryTotal(2);

  const packagedStreamMetrics = await page.evaluate(async () => {
    const api = window.lyricsCardDesktop;
    const history = await api.listImportHistory({ offset: 0, limit: 24, source: "local-audio" });
    const replay = await api.replayImportHistory(history.records[0].id);
    if (!replay.ok || replay.kind !== "local-audio") return { ok: false };
    let total = 0;
    let chunks = 0;
    let maximumPayload = 0;
    while (true) {
      const chunk = await api.readImportHistoryFileChunk(replay.file.streamToken);
      if (!chunk.ok) return { ok: false, code: chunk.code };
      total += chunk.bytes.byteLength;
      chunks += 1;
      maximumPayload = Math.max(maximumPayload, chunk.bytes.byteLength);
      if (chunk.done) break;
    }
    return {
      ok: true,
      metadataHasBytes: "bytes" in replay.file,
      declaredSize: replay.file.size,
      total,
      chunks,
      maximumPayload
    };
  });
  assert.deepEqual(packagedStreamMetrics, {
    ok: true,
    metadataHasBytes: false,
    declaredSize: largeAudioFixtureBytes,
    total: largeAudioFixtureBytes,
    chunks: 4,
    maximumPayload: 1024 * 1024
  }, "packaged replay bounds every IPC payload while preserving every source byte");

  await new Promise((resolve) => setTimeout(resolve, 25));
  await writeFile(audioPath, Buffer.from("changed desktop audio fixture with a different size"));
  const localSurface = await openHistory(2);
  await replayCard("local-audio");
  await localSurface.waitFor({ state: "hidden", timeout: 15_000 });
  await page.getByTestId("app-toast").filter({ hasText: "Original file changed" }).waitFor({ state: "visible", timeout: 15_000 });

  await rm(audioPath, { force: true });
  const missingSurface = await openHistory(2);
  const beforeMissingReplay = await currentSongTitle();
  await replayCard("local-audio");
  await missingSurface.locator('[data-testid^="history-relocate-"]').waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await missingSurface.getAttribute("data-surface-state"), "open");
  assert.equal(await currentSongTitle(), beforeMissingReplay, "a missing file preserves the current document");

  await writeFile(rejectedRelocatedAudioPath, Buffer.from("replacement fixture rejected by the renderer"));
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
  }, rejectedRelocatedAudioPath);
  localAudioShouldFail = true;
  await replayCard("local-audio", { relocate: true });
  await page.getByTestId("app-toast").filter({ hasText: "current document unchanged" }).waitFor({
    state: "visible",
    timeout: 15_000
  });
  localAudioShouldFail = false;
  const historyAfterRejectedRelocation = JSON.parse(await readFile(historyPath, "utf8"));
  const localRecordAfterRejectedRelocation = historyAfterRejectedRelocation.records.find(
    (record) => record.kind === "local-audio"
  );
  assert.equal(
    localRecordAfterRejectedRelocation?.source?.path,
    audioPath,
    "a replacement rejected by renderer parsing does not overwrite the persisted history path"
  );
  assert.equal(await currentSongTitle(), beforeMissingReplay, "a rejected replacement preserves the current document");

  await writeFile(relocatedAudioPath, Buffer.from("relocated desktop audio fixture"));
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
  }, relocatedAudioPath);
  await replayCard("local-audio", { relocate: true });
  await missingSurface.waitFor({ state: "hidden", timeout: 15_000 });
  await rm(relocatedAudioPath, { force: true });
  const relocatedMissingSurface = await openHistory(2);
  await replayCard("local-audio");
  await relocatedMissingSurface.locator('[data-testid^="history-relocate-"]').waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await currentSongTitle(), "Local history fixture", "the relocated path was used before it became missing");
  await closeHistoryWithEscape();

  const beforeOrdinaryEditCount = await historyTotal();
  await editManualSong({ title: "Ordinary metadata edit" });
  await page.waitForTimeout(300);
  assert.equal(await historyTotal(), beforeOrdinaryEditCount, "ordinary metadata edits are not recorded");
  await editManualSong({ title: "", artist: "", album: "", uploadPath: coverOnlyPath });
  await waitForHistoryTotal(beforeOrdinaryEditCount + 1);
  const coverOnlySurface = await openHistory(beforeOrdinaryEditCount + 1);
  const coverOnlyCard = coverOnlySurface.locator('[data-history-kind="manual-cover"]').first();
  assert.match(await coverOnlyCard.textContent(), /history-cover-only\.png/i);
  assert.equal(
    await coverOnlyCard.locator("p").count(),
    0,
    "a cover-only record omits an empty artist row instead of rendering a blank line"
  );
  await closeHistoryWithEscape();
  await editManualSong({ title: "Manual cover history", uploadPath: coverPath });
  await waitForHistoryTotal(beforeOrdinaryEditCount + 2);
  const manualSurface = await openHistory(beforeOrdinaryEditCount + 2);
  assert.equal(await manualSurface.locator('[data-history-kind="manual-cover"]').count(), 2, "cover-only and metadata cover saves are recorded");
  await replayCard("manual-cover");
  await manualSurface.waitFor({ state: "hidden", timeout: 15_000 });
  assert.equal(await currentSongTitle(), "Manual cover history");

  await openHistory(beforeOrdinaryEditCount + 2);
  await page.getByTestId("history-clear-all").click();
  await waitForHistoryTotal(0);
  await closeHistoryWithEscape();
  await rm(historyPath, { force: true });
  await mkdir(historyPath);

  await waitForManualSaveState("create");
  await clickManualSave();
  await page.getByTestId("app-toast").filter({ hasText: "Manual save could not be written" }).waitFor({
    state: "visible",
    timeout: 15_000
  });
  await waitForManualSaveState("create");
  assert.equal(await historyTotal(), 0, "a failed manual-save create does not bind or advance the saved revision");

  await performSearch("history write failure");
  await page.getByTestId("app-toast").filter({ hasText: "history was not updated" }).waitFor({
    state: "visible",
    timeout: 15_000
  });
  assert.match(await currentSongTitle(), /history write failure/i, "a history write failure does not roll back a successful import");
  assert.equal(await historyTotal(), 0);

  await rm(historyPath, { recursive: true, force: true });
  await performSearch("history write recovery", { waitForTotal: 1 });
  await clickManualSave();
  await waitForHistoryTotal(2);
  await waitForManualSaveState("current");
  const [pendingCloseManual] = await manualSaveRecords();
  await editManualSong({ title: "Manual update pending close" });
  await waitForManualSaveState("update");
  await rm(historyPath, { force: true });
  await mkdir(historyPath);
  await clickManualSave();
  await page.getByTestId("app-toast").filter({ hasText: "Manual save could not be written" }).waitFor({
    state: "visible",
    timeout: 15_000
  });
  await waitForManualSaveState("update");
  await rm(historyPath, { recursive: true, force: true });
  const pendingCloseLyrics = "pending close archive line\n".repeat(4_000);
  const pendingCloseSeed = await page.evaluate(async ({ recordId, lyrics }) => (
    window.lyricsCardDesktop.updateManualSave(recordId, JSON.stringify({
      version: 1,
      snapshot: {
        source: "unknown",
        title: "Manual update pending close",
        artist: "Pending Close Artist",
        album: "",
        explicit: false,
        originalCoverUrl: "",
        coverUrl: "",
        originalUrl: "",
        finalUrl: "",
        parseMethod: "manual-save-pending-close-fixture",
        lyrics,
        translationText: "",
        translationEnabled: false
      }
    }))
  ), { recordId: pendingCloseManual.id, lyrics: pendingCloseLyrics });
  assert.equal(pendingCloseSeed.ok, true, "the real preload/store path seeds a 4,000-line pending-close archive");
  assert.equal(pendingCloseSeed.record.id, pendingCloseManual.id);
  const pendingCloseSurface = await openHistory(2);
  await replayCard("manual-save");
  await pendingCloseSurface.waitFor({ state: "hidden", timeout: 15_000 });
  await waitForManualSaveState("current");
  await page.locator('[data-step-id="lyrics"]').click();
  const pendingCloseEditor = page.getByTestId("lyrics-editor-original");
  await pendingCloseEditor.waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await pendingCloseEditor.inputValue(), pendingCloseLyrics, "UI replay restores all 4,000 seeded lyric lines");
  const pendingCloseEdit = "pending close DOM edit";
  const durablePendingCloseLyrics = `${pendingCloseLyrics}${pendingCloseEdit}`;
  await pendingCloseEditor.evaluate((node, suffix) => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!valueSetter) throw new Error("native textarea value setter is unavailable");
    valueSetter.call(node, `${node.value}${suffix}`);
    node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: suffix }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, pendingCloseEdit);
  await waitForManualSaveState("update");
  assert.equal(
    await pendingCloseEditor.inputValue(),
    durablePendingCloseLyrics,
    "the small native DOM edit settles through the real React document transaction"
  );
  await clickManualSave();
  await closeThroughDesktopApi();
  const pendingCloseHistory = JSON.parse(await readFile(historyPath, "utf8"));
  const durablePendingCloseRecord = pendingCloseHistory.records.find((record) => record.id === pendingCloseManual.id);
  assert.equal(durablePendingCloseRecord?.snapshot?.title, "Manual update pending close");
  assert.equal(
    durablePendingCloseRecord?.snapshot?.lyrics,
    durablePendingCloseLyrics,
    "window close drains the in-flight 4,000-line manual-save update before shutdown"
  );

  process.stdout.write(`${JSON.stringify({
    ok: true,
    historyVersion: 2,
    dialogs: nativeDialogs.length,
    rendererDialogs,
    covered: [
      "desktop-only entry and surface focus",
      "Escape, inert, pointer isolation, reduced motion, narrow layout",
      "link and search commit, cross-source upsert, replacement cancellation",
      "paged unlimited history, cancelled limit change, and 10/5 trimming",
      "delete, clear, restart persistence",
      "local changed, missing, rejected relocate, and committed relocate",
      "cover-only/manual cover and ordinary-edit exclusion",
      "manual create/update/no-op, ordered clear boundaries, binding deletion/clear/not-found",
    "manual replay cover restoration through the image proxy without song reparse, explicit URL release, exact empty-translation roundtrip",
      "link/search/local failure intent settlement, ordinary replay creates a distinct save",
      "manual create/update failures, saved-revision retry, and 4,000-line pending-close drain",
      "remote failure and write-failure non-rollback"
    ]
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`[desktop-history-regression] ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  throw error;
} finally {
  await closeElectronApplication(electronApp, { label: "desktop-history-regression" });
  await rm(userDataDirectory, { recursive: true, force: true }).catch(() => {});
}
