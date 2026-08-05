const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { isTrustedIpcEvent } = require("../electron/ipc-security");
const { normalizeLoopbackHttpUrl, resolveLocalAppUrl } = require("../electron/local-app-url");
const { isAllowedLocalNavigation, parseAllowedExternalUrl } = require("../electron/url-policy");

const localUrl = "http://127.0.0.1:43123";
assert.equal(isAllowedLocalNavigation(`${localUrl}/settings`, localUrl), true);
assert.equal(isAllowedLocalNavigation("http://127.0.0.1:43124/settings", localUrl), false);
assert.equal(isAllowedLocalNavigation("file:///C:/secret", localUrl), false);

assert.equal(parseAllowedExternalUrl("https://github.com/Qrzzzz/lyrics-card-generator")?.hostname, "github.com");
for (const rejected of [
  "http://github.com/Qrzzzz/lyrics-card-generator",
  "https://github.com.evil.example/phish",
  "https://user:pass@github.com/private",
  "file:///C:/Windows/System32/calc.exe",
  "javascript:alert(1)",
  "data:text/html,boom",
  "custom://github.com/path",
  "https://127.0.0.1/local",
  "https://localhost/local"
]) {
  assert.equal(parseAllowedExternalUrl(rejected), null, rejected);
}

function trustedFixture(frameUrl = `${localUrl}/`, frameIsMain = true) {
  const mainFrame = { url: frameUrl };
  const senderFrame = frameIsMain ? mainFrame : { url: frameUrl };
  const sender = { mainFrame, isDestroyed: () => false };
  const mainWindow = { isDestroyed: () => false, webContents: sender };
  return { event: { sender, senderFrame }, mainWindow };
}

{
  const { event, mainWindow } = trustedFixture();
  assert.equal(isTrustedIpcEvent(event, mainWindow, localUrl), true);
}
{
  const { event, mainWindow } = trustedFixture(`${localUrl}/iframe`, false);
  assert.equal(isTrustedIpcEvent(event, mainWindow, localUrl), false, "subframes are rejected");
}
{
  const { event, mainWindow } = trustedFixture("https://evil.example/");
  assert.equal(isTrustedIpcEvent(event, mainWindow, localUrl), false, "wrong origins are rejected");
}
{
  const { event, mainWindow } = trustedFixture();
  event.sender = { ...event.sender };
  assert.equal(isTrustedIpcEvent(event, mainWindow, localUrl), false, "another webContents is rejected");
}
{
  const { event, mainWindow } = trustedFixture();
  mainWindow.isDestroyed = () => true;
  assert.equal(isTrustedIpcEvent(event, mainWindow, localUrl), false, "destroyed windows are rejected");
}

const mainSource = readFileSync("electron/main.js", "utf8");
const replayPayloadSource = mainSource.slice(
  mainSource.indexOf("async function createImportHistoryReplayPayload"),
  mainSource.indexOf("function mimeTypeForHistoryFile")
);
assert.equal((mainSource.match(/ipcMain\.handle\(/g) || []).length, 1, "every privileged IPC handler uses the trusted wrapper");
assert.match(mainSource, /setPermissionRequestHandler[\s\S]*?callback\(false\)/);
assert.match(mainSource, /setPermissionCheckHandler\(\(\) => false\)/);
assert.match(mainSource, /parseAllowedExternalUrl\(url\)/);
assert.match(mainSource, /isAllowedLocalNavigation\(url, localAppUrl\)/);
assert.match(mainSource, /resolveLocalAppUrl\(\{/);

const prepareElectronSource = readFileSync("scripts/prepare-electron-dist.mjs", "utf8");
assert.match(prepareElectronSource, /"electron\/local-app-url\.js"/, "packaged desktop bundles the local URL policy helper");
assert.match(
  prepareElectronSource,
  /path\.join\(projectRoot, "electron", "local-app-url\.js"\)[\s\S]*?path\.join\(electronOutputDir, "local-app-url\.js"\)/,
  "desktop preparation copies the local URL policy helper into the minimal app"
);
assert.match(prepareElectronSource, /"electron\/import-history\.js"/, "packaged desktop bundles the import history store");
assert.match(
  prepareElectronSource,
  /path\.join\(projectRoot, "electron", "import-history\.js"\)[\s\S]*?path\.join\(electronOutputDir, "import-history\.js"\)/,
  "desktop preparation copies the import history store into the minimal app"
);

const preloadSource = readFileSync("electron/preload.js", "utf8");
assert.match(preloadSource, /const \{ contextBridge, ipcRenderer, webUtils \} = require\("electron"\)/);
assert.match(preloadSource, /webUtils\.getPathForFile\(file\)/, "local file paths come from Electron 42 webUtils");
assert.doesNotMatch(preloadSource, /\bfile\.path\b/, "the removed File.path API is never used");
assert.match(preloadSource, /replayImportHistory: \(recordId\)[\s\S]*?invoke\("lyrics-card:import-history-replay", recordId\)/);
assert.doesNotMatch(preloadSource, /replayImportHistory: \([^)]*path/, "history replay exposes only an opaque record id");
assert.match(
  preloadSource,
  /commitImportHistoryReplay: \(recordId, relocationToken\)[\s\S]*?"lyrics-card:import-history-replay-commit"[\s\S]*?recordId,[\s\S]*?relocationToken/,
  "relocation finalization exposes only a record id and opaque main-process token"
);
assert.match(preloadSource, /createManualSave: \(input\) => ipcRenderer\.invoke\("lyrics-card:manual-save-create", input\)/);
assert.match(
  preloadSource,
  /updateManualSave: \(recordId, input\) => ipcRenderer\.invoke\("lyrics-card:manual-save-update", recordId, input\)/
);
assert.doesNotMatch(
  preloadSource,
  /(?:createManualSave|updateManualSave): \([^)]*(?:path|createdAt|lastUsedAt)/,
  "manual saves expose no renderer-selected path or timestamp"
);

assert.match(
  mainSource,
  /path\.join\(app\.getPath\("userData"\), "app-data", "import-history\.json"\)/,
  "history is stored under the desktop userData app-data directory"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:import-history-replay", async \(_event, recordId\)[\s\S]*?importHistoryStore\.get\(recordId\)[\s\S]*?createImportHistoryReplayPayload\(record\)/,
  "history replay resolves its source only from a validated stored record"
);
assert.match(mainSource, /readValidatedImportFile\(record\.kind, record\.source\.path\)/);
assert.doesNotMatch(
  replayPayloadSource,
  /await fs\.readFile\(/,
  "history replay never validates one path object and reopens another by path"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:import-history-relocate", async \(event, recordId\)[\s\S]*?readValidatedImportFile[\s\S]*?relocationToken/,
  "relocation returns a sender-bound opaque token without persisting the path"
);
assert.doesNotMatch(
  mainSource,
  /handle\("lyrics-card:import-history-relocate"[\s\S]*?updateFileReference/,
  "relocation cannot mutate history before renderer parsing and document commit"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:import-history-replay-commit"[\s\S]*?takeImportHistoryRelocation[\s\S]*?importHistoryStore\.commitReplay/,
  "path replacement, dedupe, and touch occur only in the post-document-commit IPC"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:import-history-record", \(event, input\) => trackImportHistoryMutation\(/,
  "history writes enter the shared mutation queue before their first asynchronous step"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:manual-save-create", \(_event, input\) => trackImportHistoryMutation\([\s\S]*?importHistoryStore\.createManualSave/,
  "manual save creation participates in ordered shutdown-drained mutations"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:manual-save-update", \(_event, recordId, input\) => trackImportHistoryMutation\([\s\S]*?importHistoryStore\.updateManualSave/,
  "manual save updates participate in ordered shutdown-drained mutations"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:import-history-clear", \(\) => trackImportHistoryMutation\(/,
  "clear shares the same dispatch-order mutation boundary as create and update"
);
assert.match(
  mainSource,
  /function importHistoryErrorCode\(error\)[\s\S]*?IMPORT_HISTORY_DOMAIN_ERROR_CODES\.has\(error\?\.code\)[\s\S]*?: "history_write_failed"/,
  "filesystem error codes are reduced to a stable history domain error"
);
assert.doesNotMatch(
  mainSource,
  /unable to (?:create|update) manual save[\s\S]{0,260}typeof error\?\.code/,
  "manual save IPC never forwards EACCES, EPERM, or another raw platform code"
);
const manualReplayStart = replayPayloadSource.indexOf('record.kind === "manual-save"');
const manualReplayEnd = replayPayloadSource.indexOf("try {", manualReplayStart);
assert.ok(manualReplayStart >= 0 && manualReplayEnd > manualReplayStart);
assert.doesNotMatch(
  replayPayloadSource.slice(manualReplayStart, manualReplayEnd),
  /readValidatedImportFile|fetch\(|source\.path/,
  "manual save replay returns only the validated stored snapshot without file or network access"
);
assert.match(
  mainSource,
  /while \(importHistoryOperations\.size > 0\)[\s\S]*?Promise\.allSettled[\s\S]*?await importHistoryMutationQueue[\s\S]*?await importHistoryStore\.flush\(\)/,
  "desktop close waits for in-flight history operations and then the serialized store queue"
);
assert.match(
  mainSource,
  /await appPreferencesWriteQueue;\s*await flushImportHistoryOperations\(\);\s*allowWindowClose = true/,
  "window close is allowed only after preferences and import history are durable"
);

const nextConfig = readFileSync("next.config.mjs", "utf8");
for (const directive of ["default-src 'self'", "script-src", "style-src", "img-src", "font-src", "connect-src", "object-src 'none'", "frame-ancestors 'none'"]) {
  assert.ok(nextConfig.includes(directive), directive);
}
assert.match(nextConfig, /Permissions-Policy/);

async function testLocalAppUrlSelection() {
  assert.equal(normalizeLoopbackHttpUrl("http://localhost:3000"), "http://localhost:3000/");
  assert.equal(normalizeLoopbackHttpUrl("http://127.0.0.42:3000/app"), "http://127.0.0.42:3000/app");
  assert.equal(normalizeLoopbackHttpUrl("http://[::1]:3000"), "http://[::1]:3000/");

  for (const rejected of [
    "https://localhost:3000",
    "http://localhost.evil.example:3000",
    "http://example.com:3000",
    "http://user:password@localhost:3000",
    "file:///C:/app/index.html",
    "not a URL"
  ]) {
    assert.throws(() => normalizeLoopbackHttpUrl(rejected), /ELECTRON_DEV_SERVER_URL/, rejected);
  }

  let localServerStarts = 0;
  const startLocalServer = async () => {
    localServerStarts += 1;
    return "http://127.0.0.1:43123";
  };

  const packaged = await resolveLocalAppUrl({
    isPackaged: true,
    devServerUrl: "http://attacker.example:3000",
    startLocalServer
  });
  assert.deepEqual(packaged, { url: "http://127.0.0.1:43123", waitForReady: false });
  assert.equal(localServerStarts, 1, "packaged builds ignore the configured development server");

  const development = await resolveLocalAppUrl({
    isPackaged: false,
    devServerUrl: "http://localhost:3000",
    startLocalServer
  });
  assert.deepEqual(development, { url: "http://localhost:3000/", waitForReady: true });
  assert.equal(localServerStarts, 1, "valid development URLs do not start the embedded server");

  await assert.rejects(
    resolveLocalAppUrl({
      isPackaged: false,
      devServerUrl: "http://attacker.example:3000",
      startLocalServer
    }),
    /loopback HTTP URL/
  );
  assert.equal(localServerStarts, 1, "invalid development URLs fail closed");

  const developmentFallback = await resolveLocalAppUrl({
    isPackaged: false,
    devServerUrl: undefined,
    startLocalServer
  });
  assert.deepEqual(developmentFallback, { url: "http://127.0.0.1:43123", waitForReady: false });
  assert.equal(localServerStarts, 2, "development without an override starts the embedded server");
}

testLocalAppUrlSelection()
  .then(() => console.log("Electron security contract tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
