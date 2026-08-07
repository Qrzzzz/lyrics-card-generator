/**
 * Trusts IPC only from the current window's top-level frame at the owned app origin.
 * Origin equality alone is insufficient because subframes and unrelated WebContents can also send IPC.
 */
function isTrustedIpcEvent(event, mainWindow, localAppUrl) {
  if (!mainWindow || mainWindow.isDestroyed() || !localAppUrl) return false;
  const sender = event?.sender;
  const senderFrame = event?.senderFrame;
  if (!sender || sender.isDestroyed() || sender !== mainWindow.webContents) return false;
  if (!senderFrame || senderFrame !== sender.mainFrame) return false;
  try {
    return new URL(senderFrame.url).origin === new URL(localAppUrl).origin;
  } catch {
    return false;
  }
}

function assertTrustedIpcEvent(event, mainWindow, localAppUrl) {
  if (!isTrustedIpcEvent(event, mainWindow, localAppUrl)) {
    throw new Error("IPC sender rejected by the desktop security policy.");
  }
}

module.exports = { assertTrustedIpcEvent, isTrustedIpcEvent };
