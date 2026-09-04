import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { expect } from "@playwright/test";
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
    await expect.poll(() => page.evaluate(async ({ locale, historyLimit }) => {
      const preferences = await window.lyricsCardDesktop?.loadAppPreferences();
      return document.documentElement.lang === locale
        && preferences?.locale === locale
        && preferences.userSettings?.importHistoryLimit === historyLimit;
    }, { locale: expectedLocale, historyLimit: expectedHistoryLimit }), { timeout: 30_000 }).toBe(true);
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
  await closeElectronApplication(electronApp, { label: "desktop-history-regression" });
  electronApp = undefined;
  page = undefined;
}

async function historyTotal() {
  return page.evaluate(async () => (await window.lyricsCardDesktop.getImportHistoryStats()).total);
}

async function waitForHistoryTotal(expected, timeout = 15_000) {
  await expect.poll(() => page.evaluate(async (value) => {
    const api = window.lyricsCardDesktop;
    return Boolean(api) && (await api.getImportHistoryStats()).total === value;
  }, expected), { timeout }).toBe(true);
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
  await expect.poll(() => page.evaluate(async (kind) => {
    const result = await window.lyricsCardDesktop?.listImportHistory({
      offset: 0,
      limit: 1,
      source: "all"
    });
    return result?.records[0]?.kind === kind;
  }, expected), { timeout: 15_000 }).toBe(true);
}

async function waitForPreferenceLimit(expected) {
  await expect.poll(() => page.evaluate(async (value) => {
    const preferences = await window.lyricsCardDesktop?.loadAppPreferences();
    return preferences?.userSettings?.importHistoryLimit === value;
  }, expected), { timeout: 15_000 }).toBe(true);
}

async function currentSongTitle() {
  return (await page.getByTestId("song-info-summary").locator("dd").first().textContent())?.trim() ?? "";
}

async function currentToastRevision(message) {
  const toast = page.getByTestId("app-toast").filter({ hasText: message });
  if (await toast.count() === 0) return null;
  return toast.first().getAttribute("data-repeat-revision");
}

async function waitForFreshToast(message, previousRevision) {
  await page.waitForFunction(({ expectedMessage, previous }) => (
    Array.from(document.querySelectorAll('[data-testid="app-toast"]')).some((node) => (
      node.textContent?.includes(expectedMessage)
        && node.getAttribute("data-repeat-revision") !== previous
    ))
  ), { expectedMessage: message, previous: previousRevision }, { timeout: 15_000 });
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
  await expect.poll(() => page.evaluate(async (expectedCount) => {
    const api = window.lyricsCardDesktop;
    const query = document.querySelector('[data-testid="history-search"]')?.value ?? "";
    const source = document.querySelector('[data-testid="history-source-filter"]')?.value ?? "all";
    if (!api) return false;
    const result = await api.listImportHistory({ offset: 0, limit: 24, query, source });
    return result.records.length === expectedCount;
  }, expected), { intervals: [100], timeout }).toBe(true);
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
    ["examples-button", "history-button", "clear-all-button", "settings-button"],
    "desktop actions omit the retired manual-save control"
  );
  assert.equal(await page.getByTestId("manual-save-button").count(), 0);

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
    "keyboard navigation goes directly from history to clear content"
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

  // Preserve list/limit and legacy IPC coverage independently of automatic drafts.
  const seeded = await page.evaluate(async () => {
    const api = window.lyricsCardDesktop;
    for (let index = 0; index < 26; index++) {
      const result = await api.recordImportHistory({ kind: "search", query: "legacy batch", platform: "netease",
        songId: String(90000 + index), display: { title: "Legacy item " + index, artist: "Legacy artist", source: "netease" } });
      if (!result.ok) return false;
    }
    return true;
  });
  assert.equal(seeded, true);
  await openHistory(24);
  await page.getByTestId("history-load-more").click();
  await waitForHistoryCards(26);
  await page.getByTestId("history-search").fill("Legacy item 25");
  await waitForHistoryCards(1);
  await page.getByTestId("history-search").fill("");
  await waitForHistoryCards(24);
  await closeHistoryWithEscape();
  await setNativeDialogDecision("dismiss");
  await openGeneralSettings();
  await page.getByTestId("import-history-limit").selectOption("10");
  await page.waitForTimeout(250);
  assert.equal(await page.getByTestId("import-history-limit").inputValue(), "unlimited");
  assert.equal(await historyTotal(), 26);
  await closeSettings();
  await changeHistoryLimit(10, 10);
  await changeHistoryLimit(5, 5);
  await changeHistoryLimit("unlimited", 5);
  await openHistory(5);
  await page.locator('[data-testid^="history-remove-"]').first().click();
  await waitForHistoryCards(4);
  await page.getByTestId("history-clear-all").click();
  await page.getByTestId("history-empty").waitFor();
  await closeHistoryWithEscape();
  assert.equal(await historyTotal(), 0);

  // Seed an import-only file via the real registration bridge, without an editor session
  // converting it into a full draft. Legacy streaming/relocation remains supported.
  await page.evaluate(() => {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.id = "legacy-file-fixture";
    document.body.append(picker);
  });
  const picker = page.locator("#legacy-file-fixture");
  await picker.setInputFiles(audioPath);
  const legacyFile = await picker.evaluate(async (node) => {
    const api = window.lyricsCardDesktop;
    const registered = await api.registerImportFile(node.files[0], "local-audio");
    return api.recordImportHistory({ kind: "local-audio", fileToken: registered.token,
      display: { title: "Legacy file", artist: "Legacy artist", source: "unknown" } });
  });
  assert.equal(legacyFile.ok, true);
  const packagedStreamMetrics = await page.evaluate(async (id) => {
    const api = window.lyricsCardDesktop;
    const replay = await api.replayImportHistory(id);
    if (!replay.ok || replay.kind !== "local-audio") return replay;
    let total = 0, chunks = 0, maximumPayload = 0;
    while (true) {
      const chunk = await api.readImportHistoryFileChunk(replay.file.streamToken);
      if (!chunk.ok) return chunk;
      total += chunk.bytes.byteLength;
      chunks++;
      maximumPayload = Math.max(maximumPayload, chunk.bytes.byteLength);
      if (chunk.done) break;
    }
    return { total, chunks, maximumPayload, hasBytes: "bytes" in replay.file };
  }, legacyFile.record.id);
  assert.deepEqual(packagedStreamMetrics, { total: largeAudioFixtureBytes, chunks: 4, maximumPayload: 1024 * 1024, hasBytes: false });
  await writeFile(audioPath, Buffer.from("changed legacy fixture"));
  const changed = await page.evaluate((id) => window.lyricsCardDesktop.replayImportHistory(id), legacyFile.record.id);
  assert.equal(changed.file.changed, true);
  await page.evaluate((token) => window.lyricsCardDesktop.releaseImportHistoryFile(token), changed.file.streamToken);
  await rm(audioPath);
  const missing = await page.evaluate((id) => window.lyricsCardDesktop.replayImportHistory(id), legacyFile.record.id);
  assert.equal(missing.code, "file_missing");
  assert.equal(missing.canRelocate, true);
  await writeFile(relocatedAudioPath, Buffer.from("relocated legacy fixture"));
  await electronApp.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, relocatedAudioPath);
  const relocated = await page.evaluate((id) => window.lyricsCardDesktop.relocateImportHistory(id), legacyFile.record.id);
  assert.equal(relocated.ok, true);
  assert.equal(JSON.parse(await readFile(historyPath, "utf8")).records[0].source.path, audioPath, "uncommitted relocation preserves provenance");
  await page.evaluate(async ({ id, token, stream }) => {
    await window.lyricsCardDesktop.releaseImportHistoryFile(stream);
    await window.lyricsCardDesktop.commitImportHistoryReplay(id, token);
  }, { id: legacyFile.record.id, token: relocated.relocationToken, stream: relocated.file.streamToken });
  assert.equal(JSON.parse(await readFile(historyPath, "utf8")).records[0].source.path, relocatedAudioPath);
  await page.evaluate((id) => window.lyricsCardDesktop.removeImportHistory(id), legacyFile.record.id);
  await picker.evaluate((node) => node.remove());

  // Old explicit archives remain readable; editing them creates a separate automatic draft.
  const pendingCloseLyrics = "legacy close archive line\n".repeat(4_000);
  const legacy = await page.evaluate(async (lyrics) => window.lyricsCardDesktop.createManualSave(JSON.stringify({
    version: 1, snapshot: { source: "netease", title: "Legacy archive", artist: "Legacy Artist", album: "",
      explicit: false, originalCoverUrl: "https://covers.example/legacy.png?token=SECRET", coverUrl: "",
      originalUrl: "https://music.163.com/#/song?id=70001", finalUrl: "https://music.163.com/song?id=70001",
      parseMethod: "legacy-fixture", lyrics, translationText: "", translationEnabled: true }
  })), pendingCloseLyrics);
  assert.equal(legacy.ok, true);
  await closeThroughDesktopApi();
  await launchApp({ expectedLocale: "en", expectedHistoryLimit: "unlimited" });
  const countsBeforeLegacy = { ...routeCounts };
  await openHistory(1);
  await page.getByTestId(`history-replay-${legacy.record.id}`).click();
  await page.getByTestId("history-surface").waitFor({ state: "hidden" });
  assert.equal(await page.getByLabel("Music URL").inputValue(), "https://music.163.com/song?id=70001");
  for (let roundTrip = 0; roundTrip < 2; roundTrip++) {
    await page.getByTestId("stepper-next-button").click();
    assert.equal(await page.getByTestId("lyrics-editor-original").inputValue(), pendingCloseLyrics, "UI replay restores all 4,000 seeded lyric lines");
    assert.equal(await page.getByTestId("lyrics-editor-translation").inputValue(), "");
    await page.getByTestId("stepper-back-button").click();
  }
  assert.equal(routeCounts.parseSong, countsBeforeLegacy.parseSong, "legacy archive remount performs no song reparse");
  assert.equal(routeCounts.resolveSearch, countsBeforeLegacy.resolveSearch);
  await page.getByTestId("stepper-next-button").click();
  await page.getByTestId("lyrics-editor-original").evaluate((node) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(node, node.value + "latest close edit");
    node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "latest close edit" }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await closeThroughDesktopApi();
  const document = JSON.parse(await readFile(historyPath, "utf8"));
  assert.equal(document.records.find((record) => record.id === legacy.record.id).snapshot.lyrics, pendingCloseLyrics, "legacy manual archive stays immutable");
  assert.equal(document.records.find((record) => record.id === document.activeDraftId).editorDraft.content.lyrics,
    pendingCloseLyrics + "latest close edit", "normal close drains the 4,000-line automatic draft");
  assert.deepEqual(rendererDialogs, []);
  console.log(JSON.stringify({ ok: true, covered: ["header/focus/inert/Escape/reduced-motion/narrow layout",
    "legacy canonical IPC, hostile values, safe identities, ordered create/update/clear",
    "pagination/search/filter, cancelled trimming, 10/5 limits, delete/clear",
    "legacy file streaming, changed/missing files and transactional relocation",
    "legacy manual restart/replay, empty translation, no repeated parsing, immutable archives, large-draft close"] }));
} catch (error) {
  console.log("LEGACY HISTORY FAILURE", error instanceof Error ? error.stack : String(error));
  throw error;
} finally {
  await closeElectronApplication(electronApp, { label: "desktop-history-regression" });
  assert.equal(path.dirname(userDataDirectory), tmpdir());
  await rm(userDataDirectory, { recursive: true, force: true });
}
