const { contextBridge, ipcRenderer, webUtils } = require("electron");
const { getClipboardPngEncodedByteLength } = require("./clipboard-image");

const MAX_MANUAL_SAVE_ENVELOPE_CODE_UNITS = 2 * 1024 * 1024 + 64;
const NATIVE_DIALOG_TYPES = new Set(["info", "warning", "error", "question"]);

function isClipboardPngDataUrl(value) {
  return getClipboardPngEncodedByteLength(value) !== null;
}

function isDialogText(value, maximumLength, allowEmpty = false) {
  return typeof value === "string" &&
    value.length <= maximumLength &&
    (allowEmpty || value.trim().length > 0);
}

function invokeNativeDialog(channel, type, title, message, detail, primaryLabel, cancelLabel) {
  if (
    !NATIVE_DIALOG_TYPES.has(type) ||
    !isDialogText(title, 160) ||
    !isDialogText(message, 320) ||
    !isDialogText(detail, 2_048, true) ||
    !isDialogText(primaryLabel, 80) ||
    (cancelLabel !== undefined && !isDialogText(cancelLabel, 80))
  ) {
    return Promise.resolve(false);
  }
  return cancelLabel === undefined
    ? ipcRenderer.invoke(channel, type, title, message, detail, primaryLabel)
    : ipcRenderer.invoke(channel, type, title, message, detail, primaryLabel, cancelLabel);
}

function invalidManualSaveResult() {
  return Promise.resolve({ ok: false, code: "invalid_snapshot" });
}

function invokeManualSave(channel, recordId, envelope) {
  // Reject obviously invalid payloads before structured clone; the main process repeats canonical validation.
  if (typeof envelope !== "string" || envelope.length > MAX_MANUAL_SAVE_ENVELOPE_CODE_UNITS) {
    return invalidManualSaveResult();
  }
  return recordId === undefined
    ? ipcRenderer.invoke(channel, envelope)
    : ipcRenderer.invoke(channel, recordId, envelope);
}

contextBridge.exposeInMainWorld("lyricsCardDesktopBridge", {
  setWindowMaterial: (theme) => ipcRenderer.invoke("lyrics-card:set-window-material", theme),
  minimizeWindow: () => ipcRenderer.invoke("lyrics-card:window-minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("lyrics-card:window-toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("lyrics-card:window-close"),
  confirmWindowClose: () => ipcRenderer.invoke("lyrics-card:window-close-confirm"),
  getWindowState: () => ipcRenderer.invoke("lyrics-card:window-state"),
  onWindowStateChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("lyrics-card:window-state-changed", listener);
    return () => ipcRenderer.removeListener("lyrics-card:window-state-changed", listener);
  },
  onWindowCloseRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("lyrics-card:window-close-requested", listener);
    return () => ipcRenderer.removeListener("lyrics-card:window-close-requested", listener);
  },
  showNativeConfirmDialog: (type, title, message, detail, confirmLabel, cancelLabel) => invokeNativeDialog(
    "lyrics-card:native-confirm",
    type,
    title,
    message,
    detail,
    confirmLabel,
    cancelLabel
  ),
  showNativeAlertDialog: (type, title, message, detail, closeLabel) => invokeNativeDialog(
    "lyrics-card:native-alert",
    type,
    title,
    message,
    detail,
    closeLabel
  ),
  loadAppPreferences: () => ipcRenderer.invoke("lyrics-card:app-preferences-load"),
  saveAppPreferences: (preferences, options) => ipcRenderer.invoke("lyrics-card:app-preferences-save", preferences, options),
  listSystemFonts: () => ipcRenderer.invoke("lyrics-card:list-system-fonts"),
  openExternal: (url) => ipcRenderer.invoke("lyrics-card:open-external", url),
  copyImageToClipboard: (dataUrl) => isClipboardPngDataUrl(dataUrl)
    ? ipcRenderer.invoke("lyrics-card:clipboard-write-image", dataUrl)
    : Promise.resolve(false),
  saveBackgroundImage: () => ipcRenderer.invoke("lyrics-card:background-save"),
  readBackgroundImage: (imageId) => ipcRenderer.invoke("lyrics-card:background-read", imageId),
  removeBackgroundImage: (imageId) => ipcRenderer.invoke("lyrics-card:background-remove", imageId),
  registerImportFile: (file, kind) => {
    // Resolve the native path only in preload; main converts it into a sender-bound, one-use token.
    const filePath = webUtils.getPathForFile(file);
    if (!filePath) return Promise.resolve(null);
    return ipcRenderer.invoke("lyrics-card:import-file-register", {
      kind,
      path: filePath,
      size: file.size,
      lastModified: file.lastModified
    });
  },
  listImportHistory: (options) => ipcRenderer.invoke("lyrics-card:import-history-list", options),
  getImportHistoryStats: () => ipcRenderer.invoke("lyrics-card:import-history-stats"),
  recordImportHistory: (record) => ipcRenderer.invoke("lyrics-card:import-history-record", record),
  createManualSaveEnvelope: (envelope) => invokeManualSave("lyrics-card:manual-save-create", undefined, envelope),
  updateManualSaveEnvelope: (recordId, envelope) => invokeManualSave(
    "lyrics-card:manual-save-update",
    recordId,
    envelope
  ),
  removeImportHistory: (recordId) => ipcRenderer.invoke("lyrics-card:import-history-remove", recordId),
  clearImportHistory: () => ipcRenderer.invoke("lyrics-card:import-history-clear"),
  replayImportHistory: (recordId) => ipcRenderer.invoke("lyrics-card:import-history-replay", recordId),
  relocateImportHistory: (recordId) => ipcRenderer.invoke("lyrics-card:import-history-relocate", recordId),
  readImportHistoryFileChunk: (streamToken) => ipcRenderer.invoke(
    "lyrics-card:import-history-file-read",
    streamToken
  ),
  releaseImportHistoryFile: (streamToken) => ipcRenderer.invoke(
    "lyrics-card:import-history-file-release",
    streamToken
  ),
  commitImportHistoryReplay: (recordId, relocationToken) => ipcRenderer.invoke(
    "lyrics-card:import-history-replay-commit",
    recordId,
    relocationToken
  ),
  loadAISettings: () => ipcRenderer.invoke("lyrics-card:ai-settings-load"),
  saveAISettings: (settings) => ipcRenderer.invoke("lyrics-card:ai-settings-save", settings),
  clearAISettingsApiKey: () => ipcRenderer.invoke("lyrics-card:ai-settings-api-key-clear"),
  startAITranslation: (requestId, request) => ipcRenderer.invoke("lyrics-card:ai-translate", requestId, request),
  cancelAITranslation: (requestId) => ipcRenderer.invoke("lyrics-card:ai-translate-cancel", requestId),
  onAITranslationChunk: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("lyrics-card:ai-translate-chunk", listener);
    return () => ipcRenderer.removeListener("lyrics-card:ai-translate-chunk", listener);
  }
});
