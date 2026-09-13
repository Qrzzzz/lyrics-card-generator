import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";
import { prepareEditorLanguage } from "./editor-language-test-helpers.mjs";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

const root = process.cwd();
const currentVersion = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
const versionParts = currentVersion.split(".").map(Number);
versionParts[2] += 1;
const nextVersion = versionParts.join(".");
const installerName = `Lyrics.Card.Generator.Setup.${nextVersion}.exe`;
const localizedConsent = JSON.parse(await readFile(path.join(root, "electron", "update-copy.json"), "utf8"));
const profile = await mkdtemp(path.join(tmpdir(), "lyrics-card-updater-"));
const report = path.join(root, "output", "playwright", "desktop-updater");
const installer = Buffer.alloc(4 * 1024 * 1024, 0x61);
installer.write("MZ");
const sha512 = createHash("sha512").update(installer).digest("base64");
let corrupt = false;
let installerRequests = 0;
let electronApp;
let page;
const server = createServer((request, response) => {
  request.resume();
  if (request.url.split("?")[0] === "/latest.yml") {
    response.setHeader("content-type", "text/yaml");
    response.end(`version: ${nextVersion}\nfiles:\n  - url: ${installerName}\n    sha512: ${sha512}\n    size: ${installer.length}\npath: ${installerName}\nsha512: ${sha512}\n`);
    return;
  }
  if (request.url.split("?")[0] !== `/${installerName}`) { response.writeHead(404).end(); return; }
  installerRequests += 1;
  response.setHeader("content-length", installer.length);
  let offset = 0;
  const bytes = Buffer.from(installer);
  if (corrupt) bytes[1024] ^= 1;
  const timer = setInterval(() => {
    const end = Math.min(offset + 64 * 1024, bytes.length);
    response.write(bytes.subarray(offset, end)); offset = end;
    if (offset === bytes.length) { clearInterval(timer); response.end(); }
  }, 35);
  response.on("close", () => clearInterval(timer));
});

async function phase(expected) {
  await page.waitForFunction((value) => document.querySelector('[data-testid="desktop-update"]')?.getAttribute("data-phase") === value, expected);
}
async function decide(value) {
  await electronApp.evaluate((_electron, decision) => { globalThis.__updaterTest.decision = decision; }, value);
}

try {
  await mkdir(report, { recursive: true });
  await writeFile(path.join(profile, "app-preferences.json"), JSON.stringify({ schemaVersion: 2, revision: 1, updatedAt: 1, locale: "zh", userSettings: {} }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const env = { ...process.env, LYRICS_CARD_TEST_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  electronApp = await electron.launch({ executablePath: path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe"), env, timeout: 90000 });
  page = await electronApp.firstWindow({ timeout: 90000 });
  page.setDefaultTimeout(30000);
  await prepareEditorLanguage(page, "zh");
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await page.getByTestId("settings-tab-about").click();
  if (process.env.LYRICS_CARD_UPDATER_LIVE_CHECK === "1") {
    await page.getByTestId("update-check").click();
    await phase("latest");
  }
  const liveState = await page.evaluate(() => window.lyricsCardDesktop.getUpdateState());
  assert.equal(liveState.currentVersion, currentVersion);

  // Exercise real packaged main/preload/UI and electron-updater HTTP/checksum
  // handling. Only the release transport, native dialog answer, and final
  // execution are replaced. Fixture bytes can never reach an OS installer.
  await electronApp.evaluate(({ app, net, dialog }, { feed, nextVersion }) => {
    const require = process.mainModule.require.bind(process.mainModule);
    const path = require("node:path");
    const { createRequire } = require("node:module");
    const { EventEmitter } = require("node:events");
    const runtimeRequire = createRequire(path.join(process.resourcesPath, "updater", "package.json"));
    const { NsisUpdater } = runtimeRequire("electron-updater");
    const originalRequest = net.request.bind(net);
    globalThis.__updaterTest = { decision: 1, dialogs: [], calls: [], failSave: false };
    net.request = (options) => {
      if (options.url === "https://github.com/Qrzzzz/lyrics-card-generator/releases/latest") {
        const request = new EventEmitter();
        request.abort = () => undefined;
        request.end = () => queueMicrotask(() => request.emit("redirect", 302, "HEAD", `https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v${nextVersion}`));
        return request;
      }
      return originalRequest(options);
    };
    const setFeedURL = NsisUpdater.prototype.setFeedURL;
    NsisUpdater.prototype.setFeedURL = function (options) {
      if (options.url !== `https://github.com/Qrzzzz/lyrics-card-generator/releases/download/v${nextVersion}/`) throw new Error("untrusted feed");
      return setFeedURL.call(this, { ...options, url: feed });
    };
    // Each test profile owns a private download cache.
    const { Lazy } = runtimeRequire("lazy-val");
    const check = NsisUpdater.prototype.checkForUpdates;
    NsisUpdater.prototype.checkForUpdates = function (...args) {
      this.configOnDisk = new Lazy(() => Promise.resolve({ updaterCacheDirName: path.basename(app.getPath("userData")) }));
      return check.apply(this, args);
    };
    NsisUpdater.prototype.quitAndInstall = function (...args) { globalThis.__updaterTest.calls.push({ event: "install", args }); };
    dialog.showMessageBox = async (_window, options) => {
      globalThis.__updaterTest.dialogs.push(options);
      return { response: options.type === "question" ? globalThis.__updaterTest.decision : 0, checkboxChecked: false };
    };
    const sourceRequire = createRequire(path.join(app.getAppPath(), "package.json"));
    const { AISettingsStore } = sourceRequire("./electron/ai-settings-store");
    const flush = AISettingsStore.prototype.flush;
    AISettingsStore.prototype.flush = async function () {
      globalThis.__updaterTest.calls.push({ event: "flush" });
      if (globalThis.__updaterTest.failSave) throw new Error("fixture save failure");
      return flush.call(this);
    };
  }, { feed: origin, nextVersion });

  await page.getByTestId("update-check").click();
  await phase("available");
  assert.equal(installerRequests, 0);
  await page.getByTestId("update-download").click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="update-download"]').disabled);
  assert.equal(installerRequests, 0, "declined native consent never downloads");
  const consent = await electronApp.evaluate(() => globalThis.__updaterTest.dialogs.at(-1));
  assert.ok(consent.message.includes(nextVersion));
  assert.equal(consent.defaultId, 1);
  assert.equal(consent.buttons[0], "同意并更新");
  await page.screenshot({ path: path.join(report, "available-zh.png") });

  for (const locale of ["zh-TW", "en", "fr", "ja", "es", "zh"]) {
    await page.getByTestId("settings-tab-general").click();
    await page.locator(`[data-testid="language-option"][data-locale="${locale}"]`).click();
    const savedLocaleDeadline = Date.now() + 10000;
    while (await page.evaluate(async () => (await window.lyricsCardDesktop.loadAppPreferences())?.locale) !== locale) {
      assert.ok(Date.now() < savedLocaleDeadline, "language preference must finish saving");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await page.getByTestId("settings-tab-about").click();
    await phase("available");
    await page.getByTestId("update-download").click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="update-download"]').disabled);
    const dialog = await electronApp.evaluate(() => globalThis.__updaterTest.dialogs.at(-1));
    assert.equal(dialog.buttons[0], localizedConsent[locale].confirm);
    assert.equal(dialog.defaultId, 1);
  }
  assert.equal(installerRequests, 0, "consent is required in every supported language");
  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.unmaximize(); window.setSize(1000, 700);
  });
  await page.getByTestId("update-download").scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), "update controls fit the minimum window width");
  await page.screenshot({ path: path.join(report, "minimum-window-zh.png") });
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));

  await decide(0);
  await page.getByTestId("update-download").click();
  await phase("downloading");
  await page.waitForFunction(() => Number(document.querySelector('progress')?.value) > 0);
  await page.screenshot({ path: path.join(report, "downloading-zh.png") });
  await page.getByTestId("settings-tab-general").click();
  await page.getByTestId("settings-tab-about").click();
  await phase("downloading");
  await page.getByTestId("update-cancel").click();
  await phase("available");
  assert.equal((await electronApp.evaluate(() => globalThis.__updaterTest.calls.filter((row) => row.event === "install"))).length, 0);

  corrupt = true;
  await page.getByTestId("update-download").click();
  await phase("downloading");
  await phase("available");
  assert.match(await page.getByTestId("desktop-update").textContent(), /校验失败/);
  assert.equal((await electronApp.evaluate(() => globalThis.__updaterTest.calls.filter((row) => row.event === "install"))).length, 0);

  corrupt = false;
  await electronApp.evaluate(() => { globalThis.__updaterTest.failSave = true; });
  await page.getByTestId("update-download").click();
  await phase("downloaded");
  await page.waitForFunction(() => document.querySelector('[data-testid="desktop-update"]')?.textContent.includes("未能保存"));
  assert.equal((await electronApp.evaluate(() => globalThis.__updaterTest.calls.filter((row) => row.event === "install"))).length, 0);
  await electronApp.evaluate(() => { globalThis.__updaterTest.failSave = false; });
  await page.getByTestId("update-install").click();
  await phase("installing");
  const final = await electronApp.evaluate(() => globalThis.__updaterTest);
  assert.equal(final.calls.at(-2).event, "flush");
  assert.deepEqual(final.calls.at(-1), { event: "install", args: [true, true] });
  assert.equal(final.calls.filter((row) => row.event === "install").length, 1);
  assert.equal(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  await writeFile(path.join(report, "results.json"), JSON.stringify({ ok: true, initialState: liveState, liveCheckPerformed: process.env.LYRICS_CARD_UPDATER_LIVE_CHECK === "1", installerRequests, nativeConsent: consent, calls: final.calls, fixtureInstallerNeverExecuted: true }, null, 2));
  console.log("Packaged updater UI passed: native consent, real HTTP download, progress, remount, cancellation, SHA-512 failure, save failure and install handoff.");
} catch (error) {
  await page?.screenshot({ path: path.join(report, "failure.png") }).catch(() => undefined);
  throw error;
} finally {
  await closeElectronApplication(electronApp, { label: "desktop-updater" });
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
  const cache = path.resolve(process.env.LOCALAPPDATA ?? tmpdir(), path.basename(profile));
  assert.ok(path.basename(cache).startsWith("lyrics-card-updater-"));
  await rm(cache, { recursive: true, force: true });
}
