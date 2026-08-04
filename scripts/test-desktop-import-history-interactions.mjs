import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe");
const userDataDirectory = await mkdtemp(path.join(tmpdir(), "lyrics-card-history-desktop-test-"));
const fixtureDirectory = path.join(userDataDirectory, "fixtures");
const audioPath = path.join(fixtureDirectory, "history-audio.mp3");
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
let resolveShouldFail = false;
let localAudioShouldFail = false;
let nextSongId = 71_000;
const keywordIds = new Map([["same platform song", "70001"]]);
const songsById = new Map();
const dialogMessages = [];

await mkdir(fixtureDirectory, { recursive: true });
await writeFile(audioPath, Buffer.from("initial desktop audio fixture"));
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
}

async function launchApp() {
  electronApp = await electron.launch({
    executablePath,
    env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: userDataDirectory },
    timeout: 60_000
  });
  page = await electronApp.firstWindow({ timeout: 60_000 });
  page.on("pageerror", (error) => process.stderr.write(`[history-renderer] ${error.stack || error.message}\n`));
  page.on("dialog", async (dialog) => {
    dialogMessages.push(dialog.message());
    if (dialogDecision === "accept") await dialog.accept();
    else await dialog.dismiss();
  });
  await attachRoutes(page);

  const firstLaunch = page.getByTestId("first-launch-language-dialog");
  await firstLaunch.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  if (await firstLaunch.isVisible()) {
    await page.locator('[data-testid="first-launch-language"][data-locale="en"]').click();
    await firstLaunch.waitFor({ state: "hidden", timeout: 15_000 });
  }
  await page.locator('[data-testid="editor-surface"] [data-testid="history-button"]').waitFor({
    state: "visible",
    timeout: 30_000
  });
}

async function closeThroughDesktopApi() {
  if (!page || page.isClosed()) return;
  const closed = page.waitForEvent("close", { timeout: 15_000 });
  await page.evaluate(() => window.lyricsCardDesktop?.confirmWindowClose()).catch(() => {});
  await closed.catch(() => {});
  await electronApp?.close().catch(() => {});
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

async function waitForPreferenceLimit(expected) {
  await page.waitForFunction(async (value) => {
    const preferences = await window.lyricsCardDesktop?.loadAppPreferences();
    return preferences?.userSettings?.importHistoryLimit === value;
  }, expected, { timeout: 15_000 });
}

async function currentSongTitle() {
  return (await page.getByTestId("song-info-summary").locator("dd").first().textContent())?.trim() ?? "";
}

async function openHistory(expectedVisibleCards = null) {
  await page.locator('[data-testid="editor-surface"] [data-testid="history-button"]').click();
  const surface = page.getByTestId("history-surface");
  await surface.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(80);
  await page.waitForFunction(() => (
    !document.querySelector('[data-testid="history-loading"]')
  ), null, { timeout: 15_000 });
  if (expectedVisibleCards !== null) {
    await page.waitForFunction((expected) => (
      document.querySelectorAll('[data-testid="history-surface"] [data-history-kind]').length === expected
    ), expectedVisibleCards, { timeout: 15_000 });
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
  const textInputs = editor.locator('input:not([type="file"])');
  await textInputs.nth(0).fill(title);
  await textInputs.nth(1).fill(artist);
  await textInputs.nth(2).fill(album);
  if (uploadPath) {
    await editor.locator('input[type="file"]').setInputFiles(uploadPath);
    await page.waitForFunction(() => {
      const save = document.querySelector('[data-testid="song-info-save"]');
      return save instanceof HTMLButtonElement && !save.disabled;
    });
  }
  await editor.getByTestId("song-info-save").click();
  await aside.getByTestId("song-info-summary").waitFor({ state: "visible" });
}

try {
  await launchApp();

  const actionIds = await page.locator('[data-testid="editor-header-actions"] > button').evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute("data-testid"))
  );
  assert.deepEqual(
    actionIds,
    ["examples-button", "history-button", "clear-all-button", "settings-button"],
    "desktop history entry is present in the required order"
  );

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
  dialogDecision = "dismiss";
  await replayCard("search");
  dialogDecision = "accept";
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

  dialogDecision = "dismiss";
  await openGeneralSettings();
  await page.getByTestId("import-history-limit").selectOption("10");
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId("import-history-limit").inputValue(), "unlimited");
  assert.equal(await historyTotal(), 26, "cancelling a destructive limit change preserves all records");
  dialogDecision = "accept";
  await closeSettings();

  await changeHistoryLimit(10, 10);
  await changeHistoryLimit(5, 5);
  assert.ok(
    dialogMessages.some((message) => /delete|remove|删除|刪除/i.test(message)),
    "lowering a history limit shows an explicit destructive confirmation"
  );
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
  const persistedBeforeRestart = JSON.parse(await readFile(historyPath, "utf8"));
  assert.equal(persistedBeforeRestart.schemaVersion, 1);
  assert.equal(persistedBeforeRestart.records.length, 1);
  await closeThroughDesktopApi();

  await launchApp();
  await waitForHistoryTotal(1);
  const persistedSurface = await openHistory(1);
  assert.match(await persistedSurface.textContent(), /restart persistence/i, "history survives a desktop restart");
  resolveShouldFail = true;
  const blankBeforeRemoteFailure = await currentSongTitle();
  await replayCard("search");
  await page.getByTestId("app-toast").filter({ hasText: "current document was not changed" }).waitFor({
    state: "visible",
    timeout: 15_000
  });
  assert.equal(await persistedSurface.getAttribute("data-surface-state"), "open", "remote replay failure keeps history open");
  assert.equal(await currentSongTitle(), blankBeforeRemoteFailure, "remote replay failure preserves the current document");
  resolveShouldFail = false;
  await closeHistoryWithEscape();

  await page.locator('input[accept*=".mp3"]').setInputFiles(audioPath);
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="song-info-summary"]')?.textContent?.includes("Local history fixture")
  ), null, { timeout: 15_000 });
  await waitForHistoryTotal(2);

  await new Promise((resolve) => setTimeout(resolve, 25));
  await writeFile(audioPath, Buffer.from("changed desktop audio fixture with a different size"));
  const localSurface = await openHistory(2);
  await replayCard("local-audio");
  await localSurface.waitFor({ state: "hidden", timeout: 15_000 });
  await page.getByTestId("app-toast").filter({ hasText: "file has changed" }).waitFor({ state: "visible", timeout: 15_000 });

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
  await page.getByTestId("app-toast").filter({ hasText: "current document was not changed" }).waitFor({
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

  const failureSurface = await openHistory(beforeOrdinaryEditCount + 2);
  await page.getByTestId("history-clear-all").click();
  await waitForHistoryTotal(0);
  await closeHistoryWithEscape();
  await rm(historyPath, { force: true });
  await mkdir(historyPath);

  await performSearch("history write failure");
  await page.getByTestId("app-toast").filter({ hasText: "history could not be saved" }).waitFor({
    state: "visible",
    timeout: 15_000
  });
  assert.match(await currentSongTitle(), /history write failure/i, "a history write failure does not roll back a successful import");
  assert.equal(await historyTotal(), 0);

  await rm(historyPath, { recursive: true, force: true });
  await performSearch("history write recovery", { waitForTotal: 1 });
  await closeThroughDesktopApi();

  process.stdout.write(`${JSON.stringify({
    ok: true,
    historyVersion: 1,
    dialogs: dialogMessages.length,
    covered: [
      "desktop-only entry and surface focus",
      "Escape, inert, pointer isolation, reduced motion, narrow layout",
      "link and search commit, cross-source upsert, replacement cancellation",
      "paged unlimited history, cancelled limit change, and 10/5 trimming",
      "delete, clear, restart persistence",
      "local changed, missing, rejected relocate, and committed relocate",
      "cover-only/manual cover and ordinary-edit exclusion",
      "remote failure and write-failure non-rollback"
    ]
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`[desktop-history-regression] ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  throw error;
} finally {
  await electronApp?.close().catch(() => {});
  await rm(userDataDirectory, { recursive: true, force: true }).catch(() => {});
}
