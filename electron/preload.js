const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lyricsCardDesktop", {
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
  loadAppPreferences: () => ipcRenderer.invoke("lyrics-card:app-preferences-load"),
  saveAppPreferences: (preferences) => ipcRenderer.invoke("lyrics-card:app-preferences-save", preferences),
  listSystemFonts: () => ipcRenderer.invoke("lyrics-card:list-system-fonts"),
  pickFont: () => ipcRenderer.invoke("lyrics-card:pick-font"),
  openExternal: (url) => ipcRenderer.invoke("lyrics-card:open-external", url),
  saveBackgroundImage: () => ipcRenderer.invoke("lyrics-card:background-save"),
  readBackgroundImage: (imageId) => ipcRenderer.invoke("lyrics-card:background-read", imageId),
  removeBackgroundImage: (imageId) => ipcRenderer.invoke("lyrics-card:background-remove", imageId),
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
