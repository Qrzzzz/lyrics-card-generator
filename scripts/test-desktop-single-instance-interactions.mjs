import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

if (process.platform !== "win32") {
  throw new Error("The packaged single-instance interaction regression requires Windows.");
}

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = process.env.LYRICS_CARD_TEST_EXECUTABLE
  ? path.resolve(process.env.LYRICS_CARD_TEST_EXECUTABLE)
  : path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe");
const serverEntry = path.join(path.dirname(executablePath), "resources", "server", "server.js");
const reportDirectory = path.join(root, "playwright-report", "desktop");
const userDataDirectory = await mkdtemp(path.join(tmpdir(), "lyrics-card-single-instance-test-"));
const historyPath = path.join(userDataDirectory, "app-data", "import-history.json");
const launchEnvironment = {
  ...process.env,
  LYRICS_CARD_TEST_USER_DATA: userDataDirectory
};
delete launchEnvironment.ELECTRON_RUN_AS_NODE;

let electronApp;
let page;

try {
  await access(executablePath);
  await access(serverEntry);
  await mkdir(reportDirectory, { recursive: true });

  electronApp = await electron.launch({
    executablePath,
    env: launchEnvironment,
    timeout: 90_000
  });
  page = await electronApp.firstWindow({ timeout: 90_000 });
  await page.waitForFunction(() => Boolean(window.lyricsCardDesktopBridge), undefined, { timeout: 30_000 });

  const primaryState = await electronApp.evaluate(({ app, BrowserWindow }) => ({
    pid: process.pid,
    ownsLock: app.hasSingleInstanceLock(),
    windowCount: BrowserWindow.getAllWindows().length
  }));
  assert.equal(primaryState.ownsLock, true, "the normal packaged launch owns the single-instance lock");
  assert.equal(primaryState.windowCount, 1, "normal single-instance startup creates exactly one main window");

  const writeResult = await page.evaluate(() => window.lyricsCardDesktopBridge.recordImportHistory({
    kind: "link",
    display: {
      title: "Song 1",
      artist: "Single-instance regression",
      album: "",
      source: "netease"
    },
    source: {
      inputUrl: "https://music.163.com/song?id=99001",
      normalizedUrl: "https://music.163.com/song?id=99001",
      finalUrl: "https://music.163.com/song?id=99001"
    }
  }));
  assert.equal(writeResult?.ok, true, "the owning process retains normal privileged IPC/write behavior");

  const historyBeforeSecondary = await waitForHistoryRecord();
  assert.equal(historyBeforeSecondary.document.records.length, 1);
  assert.equal(historyBeforeSecondary.document.records[0].display.title, "Song 1");

  const initialServers = await waitForBundledServer(primaryState.pid);
  assert.equal(initialServers.length, 1, "the owning process has exactly one bundled Next child");
  const primaryServerPid = initialServers[0].processId;

  const instrumentation = await electronApp.evaluate(({ app, BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) throw new Error("Primary BrowserWindow is unavailable.");
    const probe = {
      secondInstanceEvents: 0,
      restoreCalls: 0,
      showCalls: 0,
      focusCalls: 0
    };
    const originalRestore = mainWindow.restore.bind(mainWindow);
    const originalShow = mainWindow.show.bind(mainWindow);
    const originalFocus = mainWindow.focus.bind(mainWindow);
    mainWindow.restore = (...args) => {
      probe.restoreCalls += 1;
      return originalRestore(...args);
    };
    mainWindow.show = (...args) => {
      probe.showCalls += 1;
      return originalShow(...args);
    };
    mainWindow.focus = (...args) => {
      probe.focusCalls += 1;
      return originalFocus(...args);
    };
    app.on("second-instance", () => {
      probe.secondInstanceEvents += 1;
    });
    globalThis.__lyricsCardSingleInstanceProbe = probe;
    return {
      restoreWrapped: mainWindow.restore !== originalRestore,
      showWrapped: mainWindow.show !== originalShow,
      focusWrapped: mainWindow.focus !== originalFocus
    };
  });
  assert.deepEqual(
    instrumentation,
    { restoreWrapped: true, showWrapped: true, focusWrapped: true },
    "the native window methods are instrumented inside the real main process"
  );

  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await waitForPrimaryWindowState((state) => state.minimized, "primary window did not minimize");
  const beforeMinimizedLaunch = await readProbe();
  const minimizedSecondary = await launchSecondary("minimized");
  assertSecondaryExited(minimizedSecondary, "minimized");
  await waitForPrimaryWindowState(
    (state) => !state.minimized
      && state.visible
      && state.probe.secondInstanceEvents > beforeMinimizedLaunch.secondInstanceEvents
      && state.probe.restoreCalls > beforeMinimizedLaunch.restoreCalls
      && state.probe.focusCalls > beforeMinimizedLaunch.focusCalls,
    "second-instance did not restore and focus the minimized primary window"
  );

  const historyAfterMinimizedLaunch = await readFile(historyPath, "utf8");
  assert.equal(
    historyAfterMinimizedLaunch,
    historyBeforeSecondary.raw,
    "the secondary process cannot overwrite the primary writer's import-history document"
  );
  await assertPrimaryOwnershipRemains(primaryState.pid, primaryServerPid);

  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  await waitForPrimaryWindowState((state) => !state.visible, "primary window did not hide");
  const beforeHiddenLaunch = await readProbe();
  const hiddenSecondary = await launchSecondary("hidden");
  assertSecondaryExited(hiddenSecondary, "hidden");
  await waitForPrimaryWindowState(
    (state) => state.visible
      && state.probe.secondInstanceEvents > beforeHiddenLaunch.secondInstanceEvents
      && state.probe.showCalls > beforeHiddenLaunch.showCalls
      && state.probe.focusCalls > beforeHiddenLaunch.focusCalls,
    "second-instance did not show and focus the hidden primary window"
  );

  const historyAfterHiddenLaunch = await readFile(historyPath, "utf8");
  assert.equal(historyAfterHiddenLaunch, historyBeforeSecondary.raw);
  await assertPrimaryOwnershipRemains(primaryState.pid, primaryServerPid);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    primaryPid: primaryState.pid,
    bundledServerPid: primaryServerPid,
    secondaryPids: [minimizedSecondary.pid, hiddenSecondary.pid],
    secondaryExitMs: [minimizedSecondary.elapsedMs, hiddenSecondary.elapsedMs],
    historyRecords: historyBeforeSecondary.document.records.length,
    scenarios: ["minimized restore/focus", "hidden show/focus", "single writer/server ownership"]
  })}\n`);
} catch (error) {
  await page?.screenshot({ path: path.join(reportDirectory, "single-instance-failure.png") }).catch(() => undefined);
  process.stderr.write(`[desktop-single-instance] ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await page?.evaluate(() => window.lyricsCardDesktopBridge?.confirmWindowClose()).catch(() => undefined);
  await closeElectronApplication(electronApp, { label: "desktop-single-instance-regression" });
  await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined);
}

async function readProbe() {
  return electronApp.evaluate(() => ({ ...globalThis.__lyricsCardSingleInstanceProbe }));
}

async function waitForPrimaryWindowState(predicate, message, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastState;
  while (Date.now() < deadline) {
    lastState = await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return {
        windowCount: BrowserWindow.getAllWindows().length,
        minimized: window?.isMinimized() ?? false,
        visible: window?.isVisible() ?? false,
        focused: window?.isFocused() ?? false,
        probe: { ...globalThis.__lyricsCardSingleInstanceProbe }
      };
    });
    if (predicate(lastState)) return lastState;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${message}; lastState=${JSON.stringify(lastState)}`);
}

async function waitForHistoryRecord(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const raw = await readFile(historyPath, "utf8");
      const document = JSON.parse(raw);
      if (document.records?.length === 1) return { raw, document };
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The primary writer did not persist the history fixture.", { cause: lastError });
}

async function launchSecondary(label) {
  const startedAt = Date.now();
  const child = spawn(executablePath, [`--single-instance-regression=${label}`], {
    cwd: root,
    env: launchEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  child.stdout?.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12_000); });
  child.stderr?.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12_000); });

  const exit = await new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      await terminateProcessTree(child.pid);
      reject(new Error(`Secondary ${label} process ${child.pid} did not exit within 15 seconds. ${output}`));
    }, 15_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });

  return {
    pid: child.pid,
    code: exit.code,
    signal: exit.signal,
    output,
    elapsedMs: Date.now() - startedAt
  };
}

function assertSecondaryExited(result, label) {
  assert.equal(result.code, 0, `the ${label} secondary exits cleanly; output=${result.output}`);
  assert.equal(result.signal, null);
  assert.ok(result.elapsedMs < 15_000, `the ${label} secondary exits quickly (${result.elapsedMs}ms)`);
}

async function assertPrimaryOwnershipRemains(primaryPid, primaryServerPid) {
  const state = await electronApp.evaluate(({ app, BrowserWindow }) => ({
    pid: process.pid,
    ownsLock: app.hasSingleInstanceLock(),
    windowCount: BrowserWindow.getAllWindows().length
  }));
  assert.deepEqual(state, { pid: primaryPid, ownsLock: true, windowCount: 1 });

  const servers = await listBundledServers();
  assert.deepEqual(
    servers.map((server) => ({ processId: server.processId, parentProcessId: server.parentProcessId })),
    [{ processId: primaryServerPid, parentProcessId: primaryPid }],
    "secondary launches create no independent bundled Next process"
  );
}

async function waitForBundledServer(primaryPid, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let servers = [];
  while (Date.now() < deadline) {
    servers = await listBundledServers();
    if (servers.length === 1 && servers[0].parentProcessId === primaryPid) return servers;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Expected one bundled server owned by ${primaryPid}; observed=${JSON.stringify(servers)}`);
}

async function listBundledServers() {
  const target = serverEntry.replaceAll("'", "''");
  const script = [
    `$target = '${target}'`,
    "$items = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.IndexOf($target, [StringComparison]::OrdinalIgnoreCase) -ge 0 } | ForEach-Object { [pscustomobject]@{ processId = [int]$_.ProcessId; parentProcessId = [int]$_.ParentProcessId; commandLine = [string]$_.CommandLine } })",
    "ConvertTo-Json -InputObject @($items) -Compress"
  ].join("; ");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true
  });
  const parsed = JSON.parse(stdout.trim() || "[]");
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function terminateProcessTree(pid) {
  if (!pid) return;
  await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
    windowsHide: true,
    timeout: 10_000
  }).catch(() => undefined);
}
