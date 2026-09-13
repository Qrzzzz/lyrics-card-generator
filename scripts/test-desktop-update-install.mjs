import assert from "node:assert/strict";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import asar from "@electron/asar";
import { _electron as electron } from "playwright";
import { waitForEditorPreferences } from "./editor-language-test-helpers.mjs";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

if (process.platform !== "win32") throw new Error("Windows update installation test requires Windows.");
const root = process.cwd();
const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
const run = promisify(execFile);
// NSIS owns shared installation registry/shortcut entries even with /D. Never
// run this destructive lifecycle gate over a user's existing installation.
await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
  $ErrorActionPreference = 'Stop'
  foreach ($taskKey in @('HKCU:\\Software\\5a835873-d72a-592e-994b-b491c1b60160', 'HKLM:\\Software\\5a835873-d72a-592e-994b-b491c1b60160')) {
    if (Test-Path -LiteralPath $taskKey) { throw 'Existing installation; use a clean Windows profile for this gate.' }
  }
  foreach ($taskFolder in @('DesktopDirectory', 'Programs')) {
    if (Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath($taskFolder)) 'Lyrics Card Generator.lnk')) { throw 'Existing shortcut; use a clean Windows profile for this gate.' }
  }
  if (Get-Process -Name 'Lyrics Card Generator' -ErrorAction SilentlyContinue) { throw 'The application is already running.' }
`], { windowsHide: true, timeout: 15000 });
const temporary = await mkdtemp(path.join(tmpdir(), "lyrics-card-real-update-"));
const installDirectory = path.join(temporary, "app");
const profile = path.join(temporary, "profile");
const executable = path.join(installDirectory, "Lyrics Card Generator.exe");
const report = path.join(root, "output", "playwright", "desktop-update-install");
const filename = `Lyrics.Card.Generator.Setup.${version}.exe`;
const releaseDirectory = path.join(root, "release");
const setup = path.join(releaseDirectory, filename);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let electronApp;
let installerRequests = 0;
let evidence;

const server = createServer((request, response) => {
  const pathname = request.url.split("?")[0];
  request.resume();
  const file = pathname === "/latest.yml" ? path.join(releaseDirectory, "latest.yml") : pathname === `/${filename}` ? setup : null;
  if (!file) { response.writeHead(404).end(); return; }
  if (file === setup) installerRequests += 1;
  const stream = createReadStream(file);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
  response.on("close", () => stream.destroy());
});

async function ownedProcessIds(requireWindow = false) {
  const literal = executable.replaceAll("'", "''");
  const result = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `@(Get-CimInstance Win32_Process -Filter \"name='Lyrics Card Generator.exe'\" | Where-Object { $_.ExecutablePath -eq '${literal}' ${requireWindow ? "-and (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).MainWindowHandle -ne 0" : ""} } | Select-Object -ExpandProperty ProcessId) | ConvertTo-Json -Compress`
  ], { windowsHide: true, timeout: 15000 });
  const value = result.stdout.trim() ? JSON.parse(result.stdout) : [];
  return Array.isArray(value) ? value : [value];
}

try {
  console.log("Preparing an isolated older-version fixture from the current app code.");
  await mkdir(report, { recursive: true });
  await mkdir(profile, { recursive: true });
  await cp(path.join(root, "release", "win-unpacked"), installDirectory, { recursive: true });
  const unpacked = path.join(temporary, "fixture-source");
  const archive = path.join(installDirectory, "resources", "app.asar");
  asar.extractAll(archive, unpacked);
  const manifest = JSON.parse(await readFile(path.join(unpacked, "package.json"), "utf8"));
  manifest.version = "0.0.0";
  await writeFile(path.join(unpacked, "package.json"), JSON.stringify(manifest));
  await asar.createPackage(unpacked, archive);
  await writeFile(path.join(profile, "app-preferences.json"), JSON.stringify({ schemaVersion: 2, revision: 1, updatedAt: 1, locale: "zh", userSettings: {} }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const feed = `http://127.0.0.1:${server.address().port}/`;
  const env = { ...process.env, LYRICS_CARD_TEST_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  electronApp = await electron.launch({ executablePath: executable, env, timeout: 90000 });
  const page = await electronApp.firstWindow({ timeout: 90000 });
  await waitForEditorPreferences(page);
  assert.equal((await page.evaluate(() => window.lyricsCardDesktop.getUpdateState())).currentVersion, "0.0.0");
  await electronApp.evaluate(({ app, net, dialog }, { feed, version, installDirectory, report }) => {
    const require = process.mainModule.require.bind(process.mainModule);
    const path = require("node:path");
    const { createRequire } = require("node:module");
    const { EventEmitter } = require("node:events");
    const runtimeRequire = createRequire(path.join(process.resourcesPath, "updater", "package.json"));
    const { NsisUpdater } = runtimeRequire("electron-updater");
    const { Lazy } = runtimeRequire("lazy-val");
    const spawnLog = NsisUpdater.prototype.spawnLog;
    NsisUpdater.prototype.spawnLog = function (file, args, ...rest) {
      require("node:fs").writeFileSync(path.join(report, "installer-launch.json"), JSON.stringify({ file, args, runAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null }));
      return spawnLog.call(this, file, args, ...rest);
    };
    const originalRequest = net.request.bind(net);
    net.request = (options) => {
      if (options.url === "https://github.com/Qrzzzz/lyrics-card-generator/releases/latest") {
        const request = new EventEmitter();
        request.abort = () => undefined;
        request.end = () => queueMicrotask(() => request.emit("redirect", 302, "HEAD", `https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v${version}`));
        return request;
      }
      return originalRequest(options);
    };
    const setFeedURL = NsisUpdater.prototype.setFeedURL;
    NsisUpdater.prototype.setFeedURL = function (options) {
      if (options.url !== `https://github.com/Qrzzzz/lyrics-card-generator/releases/download/v${version}/`) throw new Error("unexpected feed");
      this.installDirectory = installDirectory;
      this.configOnDisk = new Lazy(() => Promise.resolve({ updaterCacheDirName: path.basename(path.dirname(app.getPath("userData"))) }));
      return setFeedURL.call(this, { ...options, url: feed });
    };
    dialog.showMessageBox = async (_window, options) => {
      if (options.type !== "question") throw new Error(`Unexpected dialog: ${options.message}`);
      return { response: 0, checkboxChecked: false };
    };
  }, { feed, version, installDirectory, report });
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await page.getByTestId("settings-tab-about").click();
  await page.getByTestId("update-check").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="desktop-update"]')?.getAttribute("data-phase") === "available");
  const oldPid = await electronApp.evaluate(() => process.pid);
  console.log(`Downloading the actual ${version} Setup and running the real NSIS update.`);
  await page.getByTestId("update-download").click();
  const deadline = Date.now() + 120000;
  let installedVersion;
  let reopenedPids = [];
  while (Date.now() < deadline) {
    try { installedVersion = JSON.parse(asar.extractFile(archive, "package.json").toString("utf8")).version; } catch { /* installer is replacing files */ }
    if (installedVersion === version) {
      reopenedPids = (await ownedProcessIds(true)).filter((pid) => pid !== oldPid);
      if (reopenedPids.length > 0) break;
    }
    await delay(1000);
  }
  assert.equal(installedVersion, version, "NSIS must replace the synthetic old fixture with the actual target version");
  assert.equal(reopenedPids.length, 1, "exactly one new application window must reopen after the updater exits");
  assert.ok(!((await ownedProcessIds()).includes(oldPid)), "the old application must exit");
  const installedHash = createHash("sha256").update(await readFile(archive)).digest("hex");
  const expectedHash = createHash("sha256").update(await readFile(path.join(root, "release", "win-unpacked", "resources", "app.asar"))).digest("hex");
  assert.equal(installedHash, expectedHash, "the installed application must be byte-identical to the target build");
  assert.equal(JSON.parse(await readFile(path.join(profile, "app-preferences.json"), "utf8")).locale, "zh");
  assert.equal(installerRequests, 1);
  evidence = { ok: true, fixtureVersion: "0.0.0", fixtureUsesCurrentUpdaterCode: true, targetVersion: version,
    actualSetupExecuted: filename, installerRequests, installerSha256: createHash("sha256").update(await readFile(setup)).digest("hex"),
    installedAsarSha256: installedHash, reopened: true, visibleMainWindows: reopenedPids.length, preferencesPreserved: true, publicFeedTested: false };
  console.log("Real NSIS update passed: target bytes installed, previous process exited, new process reopened, and preferences survived.");
} finally {
  await closeElectronApplication(electronApp, { label: "desktop-update-install" });
  for (const pid of await ownedProcessIds()) {
    await run("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }).catch(() => undefined);
  }
  const uninstaller = path.join(installDirectory, "Uninstall Lyrics Card Generator.exe");
  await run(uninstaller, ["/S"], { windowsHide: true, timeout: 90000 }).catch(() => undefined);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  assert.ok(path.basename(temporary).startsWith("lyrics-card-real-update-"));
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  const cache = path.resolve(process.env.LOCALAPPDATA ?? tmpdir(), path.basename(temporary));
  assert.ok(path.basename(cache).startsWith("lyrics-card-real-update-"));
  await rm(cache, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
await writeFile(path.join(report, "results.json"), JSON.stringify(evidence, null, 2));
