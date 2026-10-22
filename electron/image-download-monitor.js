const { createHash } = require("node:crypto");

// Observe Chromium's native save result without holding the render transaction
// open while a person chooses a destination in the OS save dialog.
function createImageDownloadMonitor(window) {
  const pending = new Map();
  const active = new Set();
  const session = window.webContents.session;
  const fingerprint = (url) => createHash("sha256").update(url).digest("hex");
  const prune = () => {
    for (const [id, entry] of pending) if (entry.expires < Date.now()) pending.delete(id);
  };
  function prepare(id, fileName, url) {
    prune();
    if (window.isDestroyed() || typeof id !== "string" || !/^export-\d+$/.test(id) || typeof fileName !== "string" || fileName.length > 240 ||
        typeof url !== "string" || !/^data:image\/(png|webp|jpeg);base64,/.test(url) || pending.size >= 8) return false;
    pending.set(id, { fileName, fingerprint: fingerprint(url), expires: Date.now() + 60_000 });
    return true;
  }
  function onDownload(_event, item, owner) {
    if (owner !== window.webContents) return;
    prune();
    const url = item.getURL();
    if (!/^data:image\//.test(url)) return;
    const hash = fingerprint(url);
    const match = [...pending].find(([, entry]) => entry.fingerprint === hash && entry.fileName === item.getFilename());
    if (!match) return;
    const [id] = match;
    pending.delete(id);
    const done = (_event, state) => {
      active.delete(dispose);
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send("lyrics-card:image-download-result", { id, state });
      }
    };
    const dispose = () => item.removeListener("done", done);
    active.add(dispose);
    item.once("done", done);
  }
  session.on("will-download", onDownload);
  window.once("closed", () => {
    session.removeListener("will-download", onDownload);
    for (const dispose of active) dispose();
    active.clear();
    pending.clear();
  });
  return { prepare };
}

module.exports = { createImageDownloadMonitor };
