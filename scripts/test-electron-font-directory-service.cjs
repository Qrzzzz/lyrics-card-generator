const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { readFileSync } = require("node:fs");
const {
  DEFAULT_REGISTRY_REFRESH_INTERVAL_MS,
  FONT_SCAN_CANCELLED,
  FONT_SCAN_TIMEOUT,
  FontDirectoryService,
  buildWindowsFontDiscoveryScript,
  createFontSourceWatcher,
  createWindowsFontScanner
} = require("../electron/font-directory-service");

const firstScan = {
  options: [
    { label: "方正舒体 (TrueType)", family: "FZShuTi", fontWeight: 400, fontStyle: "normal" },
    { label: "Arial", family: "Arial", fontWeight: 400, fontStyle: "normal" }
  ],
  sourceDirectories: ["C:\\Windows\\Fonts"]
};
const secondScan = {
  options: [
    ...firstScan.options,
    { label: "思源黑体 Heavy", family: "Source Han Sans SC Heavy", fontWeight: 900, fontStyle: "normal" }
  ],
  sourceDirectories: ["C:\\Windows\\Fonts", "C:\\Users\\test\\AppData\\Local\\Microsoft\\Windows\\Fonts"]
};

(async () => {
  await testColdAndRepeatedRequests();
  await testConcurrentRequests();
  await testConcurrentFailureAndRetry();
  await testInvalidationAndFailedRefresh();
  await testInvalidationDuringScan();
  await testRegistryOnlyRefreshWithCompleteWatchers();
  await testConservativeRefreshWithoutWatchers();
  await testCancellation();
  await testScannerTimeoutAndCleanup();
  await testScannerShutdownAndCleanup();
  testMissingSourceParentWatcher();
  testPowerShellSourceContract();
  testMainProcessWiring();
  console.log(JSON.stringify({ ok: true, electronFontDirectoryService: 13 }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function testColdAndRepeatedRequests() {
  let scans = 0;
  const watchers = createWatcherHarness();
  const service = new FontDirectoryService({
    scan: async () => {
      scans += 1;
      return firstScan;
    },
    watch: watchers.watch,
    refreshIntervalMs: 0,
    registryRefreshIntervalMs: 0
  });

  const cold = await service.list();
  const repeated = await Promise.all(Array.from({ length: 5 }, () => service.list()));
  assert.equal(scans, 1, "one cold request scans exactly once and repeated requests stay hot");
  assert.ok(repeated.every((fonts) => fonts === cold), "hot requests reuse the normalized successful snapshot");
  assert.deepEqual(cold.map((font) => font.label), ["方正舒体", "Arial"], "the existing zh-CN sort order is preserved");
  assert.equal(watchers.open.size, 1, "the successful source directory is watched once");
  assert.equal(service.getDiagnostics().hasRefreshTimer, false, "the test can explicitly disable both refresh deadlines");
  service.dispose();
  assert.equal(watchers.closed, 1, "dispose closes the active source watcher");
}

async function testConcurrentRequests() {
  let scans = 0;
  const pending = deferred();
  const service = new FontDirectoryService({
    scan: () => {
      scans += 1;
      return pending.promise;
    },
    watch: createWatcherHarness().watch,
    refreshIntervalMs: 0
  });

  const requests = Array.from({ length: 8 }, () => service.list());
  await Promise.resolve();
  assert.equal(scans, 1, "N concurrent cold requests share one physical scan");
  pending.resolve(firstScan);
  const results = await Promise.all(requests);
  assert.ok(results.every((fonts) => fonts === results[0]), "one concurrent batch receives one identical result");
  assert.equal(service.getDiagnostics().coalescedRequests, 7);
  service.dispose();
}

async function testConcurrentFailureAndRetry() {
  let scans = 0;
  let rejectFirst;
  const failedScan = new Promise((_resolve, reject) => { rejectFirst = reject; });
  const fallbackOptions = [{ label: "Fallback", family: "Fallback", fontWeight: 400, fontStyle: "normal" }];
  const errors = [];
  const service = new FontDirectoryService({
    scan: () => {
      scans += 1;
      return scans === 1 ? failedScan : Promise.resolve(firstScan);
    },
    fallbackOptions,
    watch: createWatcherHarness().watch,
    refreshIntervalMs: 0,
    onError: (error) => errors.push(error)
  });

  const requests = Array.from({ length: 4 }, () => service.list());
  await Promise.resolve();
  rejectFirst(new Error("simulated PowerShell failure"));
  const failedBatch = await Promise.all(requests);
  assert.equal(scans, 1, "one failed concurrent batch still performs only one scan");
  assert.ok(failedBatch.every((fonts) => fonts === failedBatch[0]), "the failed batch receives one consistent fallback snapshot");
  assert.equal(failedBatch[0][0].family, "Fallback");
  assert.equal(errors.length, 1, "the physical failure is reported once");

  const retried = await service.list();
  assert.equal(scans, 2, "a failed result is never cached and the next request retries");
  assert.equal(retried.length, 2);
  await service.list();
  assert.equal(scans, 2, "the successful retry becomes the cache");
  service.dispose();
}

async function testInvalidationAndFailedRefresh() {
  let scans = 0;
  const watchers = createWatcherHarness();
  const service = new FontDirectoryService({
    scan: async () => {
      scans += 1;
      if (scans === 1) return firstScan;
      if (scans === 2) throw new Error("transient refresh failure");
      return secondScan;
    },
    watch: watchers.watch,
    refreshIntervalMs: 0
  });

  const initial = await service.list();
  watchers.emitChange("C:\\Windows\\Fonts");
  const failedRefresh = await service.list();
  assert.equal(scans, 2, "a source change marks the cache dirty and the next request rescans");
  assert.strictEqual(failedRefresh, initial, "a failed refresh can return last-known-good without replacing it");
  const recovered = await service.list();
  assert.equal(scans, 3, "a failed refresh remains dirty and retries again");
  assert.equal(recovered.length, 3, "the retry discovers the changed font source");
  assert.equal(watchers.open.size, 2, "successful refresh watches every reported source directory");
  service.dispose();
  assert.equal(watchers.open.size, 0);
}

async function testConservativeRefreshWithoutWatchers() {
  let scans = 0;
  const timers = createTimerHarness();
  const service = new FontDirectoryService({
    scan: async () => {
      scans += 1;
      return scans === 1 ? firstScan : secondScan;
    },
    watch: () => { throw new Error("watch unavailable"); },
    refreshIntervalMs: 25,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  await service.list();
  assert.equal(scans, 1);
  assert.equal(timers.pending.size, 1, "a successful scan always has a conservative refresh deadline");
  timers.fireNext();
  const refreshed = await service.list();
  assert.equal(scans, 2, "watcher failure cannot leave a permanently stale cache");
  assert.equal(refreshed.length, 3);
  service.dispose();
  assert.equal(timers.pending.size, 0, "dispose clears the conservative refresh timer");
}

async function testInvalidationDuringScan() {
  let scans = 0;
  const pending = deferred();
  const service = new FontDirectoryService({
    scan: () => {
      scans += 1;
      return scans === 1 ? pending.promise : Promise.resolve(secondScan);
    },
    watch: createWatcherHarness().watch,
    refreshIntervalMs: 0
  });

  const firstRequest = service.list();
  await Promise.resolve();
  service.invalidate();
  pending.resolve(firstScan);
  assert.equal((await firstRequest).length, 2, "the in-flight batch receives one internally consistent snapshot");
  assert.equal(service.getDiagnostics().hasCachedResult, false, "a source change during scan never publishes that snapshot as clean");
  assert.equal((await service.list()).length, 3, "the next request rescans after an in-flight invalidation");
  assert.equal(scans, 2);
  service.dispose();
}

async function testRegistryOnlyRefreshWithCompleteWatchers() {
  let scans = 0;
  const watchers = createWatcherHarness();
  const timers = createTimerHarness();
  const registeredScan = {
    options: [
      ...firstScan.options,
      { label: "Registry Existing File", family: "Registry Existing File", fontWeight: 400, fontStyle: "normal" }
    ],
    sourceDirectories: firstScan.sourceDirectories
  };
  const styledScan = {
    options: [
      firstScan.options[0],
      { label: "Arial Display Italic", family: "Arial", fontWeight: 500, fontStyle: "italic" }
    ],
    sourceDirectories: firstScan.sourceDirectories
  };
  const recoveredScan = {
    options: [
      ...styledScan.options,
      { label: "Registry Recovery", family: "Registry Recovery", fontWeight: 400, fontStyle: "normal" }
    ],
    sourceDirectories: firstScan.sourceDirectories
  };
  const service = new FontDirectoryService({
    scan: async () => {
      scans += 1;
      if (scans === 1) return firstScan;
      if (scans === 2) return registeredScan;
      if (scans === 3) return firstScan;
      if (scans === 4) return styledScan;
      if (scans === 5) throw new Error("transient registry refresh failure");
      return recoveredScan;
    },
    watch: watchers.watch,
    refreshIntervalMs: 25,
    registryRefreshIntervalMs: 300,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  const initial = await service.list();
  const repeated = await Promise.all(Array.from({ length: 5 }, () => service.list()));
  assert.equal(scans, 1, "short repeated requests perform no extra full scan");
  assert.ok(repeated.every((fonts) => fonts === initial), "the hot registry window reuses one snapshot");
  assert.equal(watchers.open.size, 1, "all reported directories are watched");
  assert.equal(timers.pending.size, 1, "complete directory watchers still retain a registry refresh deadline");
  assert.equal(timers.nextDelay(), 300, "registry-only staleness is bounded by the configured deadline");
  assert.equal(timers.unrefCalls, 1, "the registry deadline never keeps the app alive");

  timers.fireNext();
  const registeredBatch = await Promise.all(Array.from({ length: 4 }, () => service.list()));
  assert.equal(scans, 2, "four requests after registry invalidation share one scan process");
  assert.ok(registeredBatch.every((fonts) => fonts === registeredBatch[0]));
  assert.ok(registeredBatch[0].some((font) => font.family === "Registry Existing File"), "registering an existing watched file becomes visible without a file event");

  timers.fireNext();
  const unregistered = await service.list();
  assert.equal(scans, 3);
  assert.equal(unregistered.some((font) => font.family === "Registry Existing File"), false, "registry-only unregistration removes the option");

  timers.fireNext();
  const relabeled = await service.list();
  assert.equal(scans, 4);
  assert.deepEqual(
    relabeled.find((font) => font.family === "Arial"),
    { label: "Arial Display Italic", family: "Arial", fontWeight: 500, fontStyle: "italic" },
    "display-name, weight, and style registry changes replace the cached metadata"
  );

  timers.fireNext();
  const failedRefresh = await service.list();
  assert.equal(scans, 5);
  assert.strictEqual(failedRefresh, relabeled, "a failed registry refresh returns last-known-good without publishing it as clean");
  assert.equal(service.getDiagnostics().dirty, true);
  const recovered = await service.list();
  assert.equal(scans, 6, "the request after a failed registry refresh retries immediately");
  assert.ok(recovered.some((font) => font.family === "Registry Recovery"));
  assert.equal(service.getDiagnostics().refreshDelayMs, 300);
  assert.equal(DEFAULT_REGISTRY_REFRESH_INTERVAL_MS, 300_000, "the production maximum registry cache age is five minutes");

  service.dispose();
  assert.equal(timers.pending.size, 0, "dispose clears the registry refresh deadline");
  assert.equal(watchers.open.size, 0, "dispose closes fully covered directory watchers");
}

async function testCancellation() {
  const pending = deferred();
  const cancellation = Object.assign(new Error("cancelled"), { code: FONT_SCAN_CANCELLED });
  const service = new FontDirectoryService({
    scan: () => pending.promise,
    disposeScan: () => pending.reject(cancellation),
    watch: createWatcherHarness().watch,
    refreshIntervalMs: 0
  });

  const request = service.list();
  await Promise.resolve();
  service.dispose();
  await assert.rejects(request, (error) => error === cancellation, "shutdown cancellation is explicit and never converted to fallback");
  await assert.rejects(service.list(), (error) => error.code === FONT_SCAN_CANCELLED, "disposed services reject later requests");
}

async function testScannerTimeoutAndCleanup() {
  const timedOutChild = createFakeChild();
  const retryChild = createFakeChild();
  const children = [timedOutChild, retryChild];
  const timers = createTimerHarness();
  const scanner = createWindowsFontScanner({
    platform: "win32",
    spawnProcess: () => children.shift(),
    scanTimeoutMs: 25,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  const request = scanner.scan();
  assert.equal(scanner.getDiagnostics().subprocesses, 1);
  timers.fireNext();
  await assert.rejects(request, (error) => error.code === FONT_SCAN_TIMEOUT);
  assert.equal(timedOutChild.killCount, 1, "timeout terminates the PowerShell child");
  assert.equal(timedOutChild.stdout.destroyCount, 1, "timeout destroys the child stdout pipe");
  assert.equal(timedOutChild.stderr.destroyCount, 1, "timeout destroys the child stderr pipe");
  assert.equal(scanner.getDiagnostics().activeProcesses, 0, "timed-out children leave no tracked process handle");

  const retry = scanner.scan();
  retryChild.stdout.emit("data", Buffer.from(JSON.stringify({ options: firstScan.options, sourceDirectories: firstScan.sourceDirectories })));
  retryChild.emit("close", 0);
  assert.equal((await retry).options.length, 2, "a timeout does not prevent a later physical scan from succeeding");
  assert.equal(scanner.getDiagnostics().subprocesses, 2);
  scanner.dispose();
}

async function testScannerShutdownAndCleanup() {
  const child = createFakeChild();
  const timers = createTimerHarness();
  const scanner = createWindowsFontScanner({
    platform: "win32",
    spawnProcess: () => child,
    scanTimeoutMs: 25,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  const request = scanner.scan();
  scanner.dispose();
  await assert.rejects(request, (error) => error.code === FONT_SCAN_CANCELLED);
  assert.equal(child.killCount, 1, "scanner disposal terminates the active PowerShell child");
  assert.equal(timers.pending.size, 0, "scanner disposal clears the process timeout");
  assert.equal(scanner.getDiagnostics().activeProcesses, 0);
}

function testPowerShellSourceContract() {
  const script = buildWindowsFontDiscoveryScript();
  assert.match(script, /HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts/);
  assert.match(script, /HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts/);
  assert.match(script, /PrivateFontCollection/);
  assert.match(script, /InstalledFontCollection/);
  assert.match(script, /GetName\(0x0409\)/, "the English family lookup locale is unchanged");
  assert.match(script, /sourceDirectories/, "the scan reports the directories it actually reads");
}

function testMissingSourceParentWatcher() {
  const target = "C:\\Users\\test\\AppData\\Local\\Microsoft\\Windows\\Fonts";
  const parent = "C:\\Users\\test\\AppData\\Local\\Microsoft\\Windows";
  const watched = [];
  let changes = 0;
  const watchFontSource = createFontSourceWatcher({
    exists: (directory) => directory === parent,
    watch: (directory, options, onChange) => {
      watched.push({ directory, options, onChange });
      return { close() {} };
    }
  });

  watchFontSource(target, { persistent: false }, () => { changes += 1; });
  assert.equal(watched[0].directory, parent, "a missing user-font directory watches its nearest existing parent");
  watched[0].onChange("rename", "Unrelated");
  assert.equal(changes, 0, "unrelated parent churn does not invalidate the font cache");
  watched[0].onChange("rename", "Fonts");
  assert.equal(changes, 1, "creating the missing Fonts directory marks the cache dirty");
  watched[0].onChange("rename", null);
  assert.equal(changes, 2, "ambiguous parent events invalidate conservatively");
}

function testMainProcessWiring() {
  const mainSource = readFileSync("electron/main.js", "utf8");
  assert.match(mainSource, /createWindowsFontDirectoryService\(\{/);
  assert.match(
    mainSource,
    /handle\("lyrics-card:list-system-fonts"[\s\S]*?systemFontDirectoryService\.list\(\)/,
    "the inline picker reaches the guarded directory service only through the main renderer"
  );
  assert.doesNotMatch(mainSource, /listWindowsFontOptions|powershell\.exe/i, "components and IPC handlers cannot bypass the service scanner");
  assert.match(mainSource, /app\.on\("will-quit", disposeSystemFontDirectoryService\)/);
}

function createWatcherHarness() {
  const open = new Map();
  let closed = 0;
  return {
    open,
    get closed() { return closed; },
    watch(directory, _options, onChange) {
      const watcher = new EventEmitter();
      watcher.close = () => {
        if (!open.delete(directory)) return;
        closed += 1;
      };
      open.set(directory, { watcher, onChange });
      return watcher;
    },
    emitChange(directory) {
      const entry = open.get(directory);
      assert.ok(entry, `expected an active watcher for ${directory}`);
      entry.onChange("rename", "font.ttf");
    }
  };
}

function createTimerHarness() {
  let nextId = 1;
  let unrefCalls = 0;
  const pending = new Map();
  return {
    pending,
    get unrefCalls() { return unrefCalls; },
    setTimer(callback, delayMs) {
      const timer = { id: nextId++, unref() { unrefCalls += 1; } };
      pending.set(timer.id, { timer, callback, delayMs });
      return timer;
    },
    clearTimer(timer) {
      pending.delete(timer.id);
    },
    fireNext() {
      const entry = pending.values().next().value;
      assert.ok(entry, "expected a pending timer");
      pending.delete(entry.timer.id);
      entry.callback();
    },
    nextDelay() {
      return pending.values().next().value?.delayMs ?? null;
    }
  };
}

function createFakeChild() {
  const child = new EventEmitter();
  child.stdout = createFakeStream();
  child.stderr = createFakeStream();
  child.killCount = 0;
  child.unrefCount = 0;
  child.kill = () => { child.killCount += 1; };
  child.unref = () => { child.unrefCount += 1; };
  return child;
}

function createFakeStream() {
  const stream = new EventEmitter();
  stream.destroyCount = 0;
  stream.destroy = () => { stream.destroyCount += 1; };
  return stream;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
