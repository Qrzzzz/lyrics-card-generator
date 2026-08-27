const assert = require("node:assert/strict");
const Module = require("node:module");

const invocations = [];
const listeners = new Map();
let exposedBridge;

const electronMock = {
  contextBridge: {
    exposeInMainWorld(name, bridge) {
      assert.equal(name, "lyricsCardDesktopBridge");
      exposedBridge = bridge;
    }
  },
  ipcRenderer: {
    invoke(channel, ...args) {
      invocations.push({ channel, args });
      return Promise.resolve({ channel, args });
    },
    on(channel, listener) {
      listeners.set(channel, listener);
    },
    removeListener(channel, listener) {
      assert.equal(listeners.get(channel), listener);
      listeners.delete(channel);
    }
  },
  webUtils: {
    getPathForFile(file) {
      return file.nativePath;
    }
  }
};

const originalLoad = Module._load;
Module._load = function loadWithElectronMock(request, parent, isMain) {
  return request === "electron"
    ? electronMock
    : originalLoad.call(this, request, parent, isMain);
};
try {
  require("../electron/preload");
} finally {
  Module._load = originalLoad;
}

assert.ok(exposedBridge, "preload exposes the desktop bridge");

async function run() {
  const directCalls = [
    ["setWindowMaterial", ["acrylic"]],
    ["minimizeWindow", []],
    ["toggleMaximizeWindow", []],
    ["closeWindow", []],
    ["confirmWindowClose", []],
    ["getWindowState", []],
    ["showNativeConfirmDialog", ["warning", "Confirm", "Replace document", "Unsaved changes", "Continue", "Cancel"]],
    ["showNativeAlertDialog", ["error", "Error", "Save failed", "Try again", "Close"]],
    ["loadAppPreferences", []],
    ["saveAppPreferences", [{ revision: 1 }, { importHistoryTrimConfirmation: true }]],
    ["listSystemFonts", []],
    ["pickFont", []],
    ["openNativeFontPickerWindow", ["Microsoft YaHei", "Inter", "zh", "dark", "自定义字体方案"]],
    ["getNativeFontPickerContext", []],
    ["applyNativeFontPickerFamilies", ["Microsoft YaHei", "Inter"]],
    ["closeNativeFontPicker", []],
    ["openExternal", ["https://github.com/"]],
    ["saveBackgroundImage", []],
    ["readBackgroundImage", ["image-id"]],
    ["removeBackgroundImage", ["image-id"]],
    ["listImportHistory", [{ limit: 10 }]],
    ["getImportHistoryStats", []],
    ["recordImportHistory", [{ kind: "link" }]],
    ["removeImportHistory", ["record-id"]],
    ["clearImportHistory", []],
    ["replayImportHistory", ["record-id"]],
    ["relocateImportHistory", ["record-id"]],
    ["readImportHistoryFileChunk", ["stream-token"]],
    ["releaseImportHistoryFile", ["stream-token"]],
    ["commitImportHistoryReplay", ["record-id", "relocation-token"]],
    ["loadAISettings", []],
    ["saveAISettings", [{ provider: "openai" }]],
    ["clearAISettingsApiKey", []],
    ["startAITranslation", ["request-id", { prompt: "translate" }]],
    ["cancelAITranslation", ["request-id"]]
  ];
  for (const [method, args] of directCalls) await exposedBridge[method](...args);

  const invocationCountBeforeInvalidDialogs = invocations.length;
  assert.equal(
    await exposedBridge.showNativeConfirmDialog("invalid", "Confirm", "Message", "Detail", "Continue", "Cancel"),
    false
  );
  assert.equal(
    await exposedBridge.showNativeAlertDialog("error", "Error", "x".repeat(321), "Detail", "Close"),
    false
  );
  assert.equal(invocations.length, invocationCountBeforeInvalidDialogs, "invalid native dialogs never cross IPC");

  const invocationCountBeforeInvalidFontPicker = invocations.length;
  assert.equal(
    await exposedBridge.openNativeFontPickerWindow("Bad\nFont", "Arial", "en", "dark", "Custom Font Scheme"),
    null
  );
  assert.equal(
    await exposedBridge.openNativeFontPickerWindow("Microsoft YaHei", "Arial", "en", "dark", "Bad\nTitle"),
    null
  );
  assert.equal(await exposedBridge.applyNativeFontPickerFamilies("Arial", "Bad\nFont"), false);
  assert.equal(
    invocations.length,
    invocationCountBeforeInvalidFontPicker,
    "invalid native font-picker values never cross IPC"
  );

  assert.equal(await exposedBridge.registerImportFile({ nativePath: "", size: 0, lastModified: 0 }, "local-audio"), null);
  await exposedBridge.registerImportFile(
    { nativePath: "C:\\music\\song.mp3", size: 123, lastModified: 456 },
    "local-audio"
  );

  assert.deepEqual(await exposedBridge.createManualSaveEnvelope(null), { ok: false, code: "invalid_snapshot" });
  assert.deepEqual(
    await exposedBridge.createManualSaveEnvelope("x".repeat(2 * 1024 * 1024 + 65)),
    { ok: false, code: "invalid_snapshot" }
  );
  await exposedBridge.createManualSaveEnvelope("{\"schemaVersion\":1}");
  await exposedBridge.updateManualSaveEnvelope("record-id", "{\"schemaVersion\":1}");

  let observedWindowState;
  const removeWindowState = exposedBridge.onWindowStateChanged((payload) => { observedWindowState = payload; });
  listeners.get("lyrics-card:window-state-changed")({}, { maximized: true });
  assert.deepEqual(observedWindowState, { maximized: true });
  removeWindowState();

  let closeRequested = false;
  const removeCloseRequest = exposedBridge.onWindowCloseRequested(() => { closeRequested = true; });
  listeners.get("lyrics-card:window-close-requested")({});
  assert.equal(closeRequested, true);
  removeCloseRequest();

  let aiChunk;
  const removeAIChunk = exposedBridge.onAITranslationChunk((payload) => { aiChunk = payload; });
  listeners.get("lyrics-card:ai-translate-chunk")({}, { requestId: "request-id", delta: "done" });
  assert.equal(aiChunk.delta, "done");
  removeAIChunk();

  assert.ok(
    invocations.some(({ channel, args }) => (
      channel === "lyrics-card:import-file-register"
      && args[0].path === "C:\\music\\song.mp3"
      && args[0].kind === "local-audio"
    )),
    "preload converts a File into primitive sender-validation metadata"
  );
  assert.ok(
    invocations.some(({ channel, args }) => channel === "lyrics-card:manual-save-update" && args[0] === "record-id"),
    "manual-save updates retain the opaque record id"
  );
  assert.ok(
    invocations.some(({ channel, args }) => (
      channel === "lyrics-card:native-confirm"
      && args.every((value) => typeof value === "string")
      && args[0] === "warning"
      && args[4] === "Continue"
      && args[5] === "Cancel"
    )),
    "native confirmation forwards only validated primitive fields"
  );
  assert.ok(
    invocations.some(({ channel, args }) => (
      channel === "lyrics-card:native-alert"
      && args.every((value) => typeof value === "string")
      && args[0] === "error"
      && args[4] === "Close"
    )),
    "native alert forwards only validated primitive fields"
  );
  assert.ok(
    invocations.some(({ channel, args }) => (
      channel === "lyrics-card:native-font-picker-open"
      && args.length === 5
      && args.every((value) => typeof value === "string")
      && args[0] === "Microsoft YaHei"
      && args[1] === "Inter"
    )),
    "font-scheme picker opens with both bounded font families"
  );
  assert.equal(listeners.size, 0, "all preload event subscriptions are removable");
  console.log("Electron preload runtime contract tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
