const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const path = require("node:path");
const { acquireSingleInstanceOwnership } = require("../electron/single-instance-ownership");

const MAIN_GATE_FIXTURE = "--main-gate-fixture";

// Fake windows make every restore/show/focus transition observable without a
// graphical session; the separate main-gate fixture covers entry-point ordering.
function testSecondaryQuitsWithoutOwnership() {
  const app = new FakeApp(false);
  const controller = acquireSingleInstanceOwnership({
    app,
    getMainWindow: () => null
  });

  assert.equal(controller.hasLock, false);
  assert.equal(app.requestCount, 1, "the process requests ownership exactly once");
  assert.equal(app.quitCount, 1, "a process without ownership exits immediately");
  assert.equal(app.listenerCount("second-instance"), 0, "a secondary never registers primary lifecycle handlers");
}

function testPendingFocusWaitsForThePrimaryWindow() {
  const app = new FakeApp(true);
  let currentWindow = null;
  const controller = acquireSingleInstanceOwnership({
    app,
    getMainWindow: () => currentWindow
  });

  app.emit("second-instance", {}, [], process.cwd(), {});
  const window = new FakeWindow({ visible: false });
  currentWindow = window;

  assert.equal(controller.markWindowReady(window), true, "a pre-window second launch is fulfilled once the window is ready");
  assert.deepEqual(window.calls, { restore: 0, show: 1, focus: 1 });
}

function testReadyWindowFocusesWithoutChangingItsState() {
  const app = new FakeApp(true);
  const window = new FakeWindow();
  const controller = acquireSingleInstanceOwnership({ app, getMainWindow: () => window });

  assert.equal(controller.markWindowReady(window), false, "normal first-instance startup does not manufacture a focus request");
  app.emit("second-instance", {}, [], process.cwd(), {});

  assert.deepEqual(window.calls, { restore: 0, show: 0, focus: 1 });
}

function testMinimizedWindowRestoresAndFocuses() {
  const app = new FakeApp(true);
  const window = new FakeWindow({ minimized: true });
  const controller = acquireSingleInstanceOwnership({ app, getMainWindow: () => window });
  controller.markWindowReady(window);

  app.emit("second-instance", {}, [], process.cwd(), {});

  assert.equal(window.minimized, false);
  assert.deepEqual(window.calls, { restore: 1, show: 0, focus: 1 });
}

function testHiddenWindowShowsAndFocuses() {
  const app = new FakeApp(true);
  const window = new FakeWindow({ visible: false });
  const controller = acquireSingleInstanceOwnership({ app, getMainWindow: () => window });
  controller.markWindowReady(window);

  app.emit("second-instance", {}, [], process.cwd(), {});

  assert.equal(window.visible, true);
  assert.deepEqual(window.calls, { restore: 0, show: 1, focus: 1 });
}

function testReplacementWindowConsumesPendingFocus() {
  const app = new FakeApp(true);
  const firstWindow = new FakeWindow();
  const replacementWindow = new FakeWindow();
  let currentWindow = firstWindow;
  const controller = acquireSingleInstanceOwnership({ app, getMainWindow: () => currentWindow });
  controller.markWindowReady(firstWindow);

  firstWindow.destroyed = true;
  currentWindow = replacementWindow;
  app.emit("second-instance", {}, [], process.cwd(), {});

  assert.equal(controller.markWindowReady(firstWindow), false, "a stale ready event cannot consume pending focus");
  assert.equal(controller.markWindowReady(replacementWindow), true);
  assert.deepEqual(replacementWindow.calls, { restore: 0, show: 0, focus: 1 });
}

function testClosingAndQuittingWindowsAreNotRevived() {
  const app = new FakeApp(true);
  const window = new FakeWindow({ minimized: true, visible: false });
  let closing = false;
  const controller = acquireSingleInstanceOwnership({
    app,
    getMainWindow: () => window,
    isWindowClosing: () => closing
  });
  controller.markWindowReady(window);

  closing = true;
  app.emit("second-instance", {}, [], process.cwd(), {});
  closing = false;
  controller.markWindowReady(window);
  assert.deepEqual(window.calls, { restore: 0, show: 0, focus: 0 }, "a closing window is never revived later");

  controller.markQuitting();
  app.emit("second-instance", {}, [], process.cwd(), {});
  controller.markWindowReady(window);
  assert.deepEqual(window.calls, { restore: 0, show: 0, focus: 0 }, "a quitting app cannot accumulate pending focus");
}

function testMainEntryOwnershipGate() {
  // Load the real entry point with a stubbed Electron module to prove ownership
  // is decided before privileged setup, not merely inside the helper unit.
  const secondary = runMainGateScenario(false);
  assert.equal(secondary.lockRequests, 1);
  assert.equal(secondary.quitCalls, 1);
  assert.equal(secondary.storeConstructions, 0, "a secondary never becomes an import-history writer");
  assert.equal(secondary.ipcRegistrations, 0, "a secondary registers no privileged IPC");
  assert.equal(secondary.whenReadyCalls, 0, "a secondary never schedules boot");
  assert.equal(secondary.browserWindows, 0, "a secondary creates no window");
  assert.equal(secondary.commandLineSwitches, 0, "a secondary performs no primary-only Chromium setup");
  assert.deepEqual(secondary.appListeners, [], "a secondary registers no primary lifecycle listeners");

  const primary = runMainGateScenario(true);
  assert.equal(primary.lockRequests, 1);
  assert.equal(primary.quitCalls, 0);
  assert.equal(primary.storeConstructions, 1, "the owning process creates exactly one history writer");
  assert.ok(primary.ipcRegistrations > 0, "the owning process registers privileged IPC");
  assert.equal(primary.whenReadyCalls, 1, "the owning process schedules normal boot exactly once");
  assert.equal(primary.browserWindows, 0, "the fixture deliberately holds app readiness before window creation");
  assert.equal(primary.commandLineSwitches, 1);
  assert.ok(primary.appListeners.includes("second-instance"));
  assert.ok(primary.appListeners.includes("before-quit"));
  assert.ok(primary.appListeners.includes("window-all-closed"));
  assert.ok(primary.appListeners.includes("activate"));
  assert.ok(
    primary.events.indexOf("request-lock") < primary.events.indexOf("construct-history-store")
      && primary.events.indexOf("construct-history-store") < primary.events.indexOf("register-ipc")
      && primary.events.indexOf("register-ipc") < primary.events.indexOf("when-ready"),
    "ownership is acquired before writer construction, privileged IPC, and boot"
  );
}

function runMainGateScenario(lockResult) {
  const output = execFileSync(process.execPath, [__filename, MAIN_GATE_FIXTURE, String(lockResult)], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: "" },
    windowsHide: true
  });
  const line = output.trim().split(/\r?\n/).filter(Boolean).at(-1);
  return JSON.parse(line);
}

function runMainGateFixture(lockResult) {
  const events = [];
  const app = new FakeMainApp(lockResult, events);
  let storeConstructions = 0;
  let ipcRegistrations = 0;
  let browserWindows = 0;

  class FixtureBrowserWindow {
    constructor() {
      browserWindows += 1;
      events.push("construct-browser-window");
    }

    static getAllWindows() {
      return [];
    }
  }

  class FixtureImportHistoryStore {
    constructor() {
      storeConstructions += 1;
      events.push("construct-history-store");
    }

    createManualSave() {}
    updateManualSave() {}
  }

  class FixtureImportHistoryFileStreamRegistry {
    read() { return { ok: false, code: "file_reference_expired" }; }
    release() { return false; }
    releaseSender() { return 0; }
    closeAll() {}
  }

  const electronFixture = {
    app,
    BrowserWindow: FixtureBrowserWindow,
    Menu: { setApplicationMenu: () => events.push("set-application-menu") },
    dialog: { showErrorBox: () => events.push("show-error") },
    ipcMain: {
      handle: () => {
        ipcRegistrations += 1;
        if (ipcRegistrations === 1) events.push("register-ipc");
      }
    },
    safeStorage: {},
    shell: {}
  };
  const importHistoryFixture = {
    ImportHistoryFileStreamRegistry: FixtureImportHistoryFileStreamRegistry,
    ImportHistoryStore: FixtureImportHistoryStore,
    isCanonicalManualSaveEnvelope: () => true,
    normalizeImportHistoryLimit: () => 10,
    readValidatedImportFile: async () => ({ ok: false }),
    toPublicImportHistoryRecord: (record) => record,
    validateImportFileDescriptor: () => ({ ok: false })
  };

  const originalLoad = Module._load;
  Module._load = function loadFixture(request, parent, isMain) {
    if (request === "electron") return electronFixture;
    if (request === "./import-history") return importHistoryFixture;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    require("../electron/main.js");
  } finally {
    Module._load = originalLoad;
  }

  process.stdout.write(`${JSON.stringify({
    events,
    lockRequests: app.lockRequests,
    quitCalls: app.quitCalls,
    whenReadyCalls: app.whenReadyCalls,
    commandLineSwitches: app.commandLineSwitches,
    appListeners: app.registeredListeners,
    storeConstructions,
    ipcRegistrations,
    browserWindows
  })}\n`);
}

class FakeApp extends EventEmitter {
  constructor(lockResult) {
    super();
    this.lockResult = lockResult;
    this.requestCount = 0;
    this.quitCount = 0;
  }

  requestSingleInstanceLock() {
    this.requestCount += 1;
    return this.lockResult;
  }

  quit() {
    this.quitCount += 1;
  }
}

class FakeMainApp extends EventEmitter {
  constructor(lockResult, events) {
    super();
    this.lockResult = lockResult;
    this.events = events;
    this.lockRequests = 0;
    this.quitCalls = 0;
    this.whenReadyCalls = 0;
    this.commandLineSwitches = 0;
    this.registeredListeners = [];
    this.isPackaged = false;
    this.commandLine = {
      appendSwitch: () => {
        this.commandLineSwitches += 1;
        this.events.push("append-command-line-switch");
      }
    };
  }

  on(eventName, listener) {
    this.registeredListeners.push(eventName);
    return super.on(eventName, listener);
  }

  requestSingleInstanceLock() {
    this.lockRequests += 1;
    this.events.push("request-lock");
    return this.lockResult;
  }

  quit() {
    this.quitCalls += 1;
    this.events.push("quit");
  }

  setPath() {}

  getPath() {
    return path.resolve(".single-instance-main-gate-user-data");
  }

  getAppPath() {
    return path.resolve(".");
  }

  setAppUserModelId() {
    this.events.push("set-app-user-model-id");
  }

  whenReady() {
    this.whenReadyCalls += 1;
    this.events.push("when-ready");
    return new Promise(() => {});
  }
}

class FakeWindow {
  constructor({ destroyed = false, minimized = false, visible = true } = {}) {
    this.destroyed = destroyed;
    this.minimized = minimized;
    this.visible = visible;
    this.calls = { restore: 0, show: 0, focus: 0 };
  }

  isDestroyed() {
    return this.destroyed;
  }

  isMinimized() {
    return this.minimized;
  }

  isVisible() {
    return this.visible;
  }

  restore() {
    this.calls.restore += 1;
    this.minimized = false;
  }

  show() {
    this.calls.show += 1;
    this.visible = true;
  }

  focus() {
    this.calls.focus += 1;
  }
}

if (process.argv[2] === MAIN_GATE_FIXTURE) {
  runMainGateFixture(process.argv[3] === "true");
} else {
  testSecondaryQuitsWithoutOwnership();
  testPendingFocusWaitsForThePrimaryWindow();
  testReadyWindowFocusesWithoutChangingItsState();
  testMinimizedWindowRestoresAndFocuses();
  testHiddenWindowShowsAndFocuses();
  testReplacementWindowConsumesPendingFocus();
  testClosingAndQuittingWindowsAreNotRevived();
  testMainEntryOwnershipGate();
  console.log("Electron single-instance ownership tests passed");
}
