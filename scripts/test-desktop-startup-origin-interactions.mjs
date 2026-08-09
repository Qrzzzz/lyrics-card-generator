import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";
import originModule from "../electron/local-server-origin.js";

const { deriveStableLoopbackPort, findAvailableLoopbackPort, writeCachedLoopbackPort } = originModule;
const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe");
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "lyrics-card-origin-interaction-"));

if (process.platform !== "win32") throw new Error("Desktop startup origin interactions require Windows.");

try {
  await testStableRestartAndCleanRelease();
  await testCorruptStateRepair();
  await testOccupiedPortsFallBackWithoutTrustingDecoys();
  await testAbnormalParentExitReleasesServer();
  console.log("Desktop startup origin interactions passed");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined);
}

async function testStableRestartAndCleanRelease() {
  const profile = path.join(temporaryRoot, "stable");
  await seedProfile(profile);
  const first = await launch(profile);
  const firstPort = Number(new URL(first.page.url()).port);
  assert.equal((await waitForOriginState(profile)).port, firstPort);
  await close(first);
  await assertPortCanRebind(firstPort);

  const second = await launch(profile);
  assert.equal(new URL(second.page.url()).port, String(firstPort), "clean restart reuses the stable cache origin");
  await close(second);
  await assertPortCanRebind(firstPort);
}

async function testCorruptStateRepair() {
  const profile = path.join(temporaryRoot, "corrupt");
  await seedProfile(profile);
  await writeFile(path.join(profile, "desktop-server-origin.json"), "{ definitely-not-json", "utf8");
  const app = await launch(profile);
  const state = await waitForOriginState(profile);
  assert.equal(state.port, Number(new URL(app.page.url()).port));
  assert.deepEqual(Object.keys(state).sort(), ["port", "version"]);
  await close(app);
}

async function testOccupiedPortsFallBackWithoutTrustingDecoys() {
  const profile = path.join(temporaryRoot, "occupied");
  await seedProfile(profile);
  const derivedPort = deriveStableLoopbackPort(profile);
  let cachedPort = await findAvailableLoopbackPort();
  while (cachedPort === derivedPort) cachedPort = await findAvailableLoopbackPort();
  const decoys = [];
  const requests = [];
  try {
    decoys.push(await startDecoy(cachedPort, requests));
    try {
      decoys.push(await startDecoy(derivedPort, requests));
    } catch (error) {
      if (error?.code !== "EADDRINUSE") throw error;
    }
    await writeCachedLoopbackPort(path.join(profile, "desktop-server-origin.json"), cachedPort);
    const app = await launch(profile);
    const selectedPort = Number(new URL(app.page.url()).port);
    assert.notEqual(selectedPort, cachedPort);
    assert.notEqual(selectedPort, derivedPort);
    assert.equal((await waitForOriginState(profile)).port, selectedPort);
    assert.equal(await app.page.getByTestId("editor-surface").isVisible(), true, "fallback loads the owned app, not a decoy");
    assert.equal(requests.length, 0, "availability probes never treat a decoy HTTP response as readiness");
    await close(app);
  } finally {
    await Promise.all(decoys.map((server) => closeServer(server)));
  }
}

async function testAbnormalParentExitReleasesServer() {
  const profile = path.join(temporaryRoot, "crash");
  await seedProfile(profile);
  const first = await launch(profile);
  const firstPort = Number(new URL(first.page.url()).port);
  const mainPid = await first.electronApp.evaluate(() => process.pid);
  await execFileAsync("taskkill.exe", ["/PID", String(mainPid), "/F"], {
    windowsHide: true,
    timeout: 10_000
  });
  first.electronApp = undefined;
  await waitForPidExit(first.serverPid, 10_000);
  await assertPortCanRebind(firstPort);

  const restarted = await launch(profile);
  assert.equal(new URL(restarted.page.url()).port, String(firstPort), "restart after a crash safely reclaims the cached port");
  await close(restarted);
}

async function launch(profile) {
  const environment = {
    ...process.env,
    LYRICS_CARD_STARTUP_TRACE: "1",
    LYRICS_CARD_TEST_USER_DATA: profile
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  const electronApp = await electron.launch({ executablePath, env: environment, timeout: 90_000 });
  const page = await electronApp.firstWindow({ timeout: 90_000 });
  await page.waitForFunction(() => Boolean(window.lyricsCardDesktopBridge), undefined, { timeout: 30_000 });
  await page.locator('[data-testid="editor-surface"]').waitFor({ state: "visible", timeout: 30_000 });
  const trace = await electronApp.evaluate(() => globalThis.__lyricsCardStartupTrace?.snapshot());
  const serverPid = trace?.marks.find((mark) => mark.name === "next-process-spawned")?.detail?.pid;
  assert.ok(Number.isSafeInteger(serverPid) && serverPid > 0, "trace identifies the one owned Next child");
  return { electronApp, page, serverPid };
}

async function close(application) {
  if (!application.electronApp) return;
  await application.page.evaluate(() => window.lyricsCardDesktopBridge?.confirmWindowClose()).catch(() => undefined);
  await closeElectronApplication(application.electronApp, { label: "desktop-startup-origin" });
  application.electronApp = undefined;
  await waitForPidExit(application.serverPid, 10_000);
}

async function seedProfile(profile) {
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, "app-preferences.json"), `${JSON.stringify({
    schemaVersion: 2,
    revision: 1,
    updatedAt: 1,
    locale: "zh",
    userSettings: { firstLaunchLanguageSelected: true }
  })}\n`, "utf8");
}

async function waitForOriginState(profile, timeoutMs = 10_000) {
  const statePath = path.join(profile, "desktop-server-origin.json");
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const state = JSON.parse(await readFile(statePath, "utf8"));
      if (Number.isSafeInteger(state.port)) return state;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`origin state was not persisted: ${lastError}`);
}

async function assertPortCanRebind(port) {
  const server = http.createServer((_request, response) => response.end("released"));
  try {
    await listen(server, port);
  } finally {
    await closeServer(server);
  }
}

async function startDecoy(port, requests) {
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ service: "lyrics-card-generator-desktop", proof: "0".repeat(64) }));
  });
  await listen(server, port);
  return server;
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function waitForPidExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return;
    await delay(50);
  }
  throw new Error(`process ${pid} did not exit within ${timeoutMs}ms`);
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
