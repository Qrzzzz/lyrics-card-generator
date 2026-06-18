const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lyricsCardDesktop", {
  listSystemFonts: () => ipcRenderer.invoke("lyrics-card:list-system-fonts"),
  pickFont: () => ipcRenderer.invoke("lyrics-card:pick-font"),
  openExternal: (url) => ipcRenderer.invoke("lyrics-card:open-external", url)
});
