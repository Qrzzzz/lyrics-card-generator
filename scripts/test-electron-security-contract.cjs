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
