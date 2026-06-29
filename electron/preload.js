const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lyricsCardDesktop", {
  setWindowMaterial: (theme) => ipcRenderer.invoke("lyrics-card:set-window-material", theme),
  minimizeWindow: () => ipcRenderer.invoke("lyrics-card:window-minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("lyrics-card:window-toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("lyrics-card:window-close"),
  getWindowState: () => ipcRenderer.invoke("lyrics-card:window-state"),
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
  cancelAITranslation: (requestId) => ipcRenderer.send("lyrics-card:ai-translate-cancel", requestId),
  onAITranslationChunk: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("lyrics-card:ai-translate-chunk", listener);
    return () => ipcRenderer.removeListener("lyrics-card:ai-translate-chunk", listener);
  }
});
