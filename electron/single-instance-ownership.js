function acquireSingleInstanceOwnership({
  app,
  getMainWindow,
  isWindowClosing = () => false
}) {
  if (!app || typeof app.requestSingleInstanceLock !== "function" || typeof app.quit !== "function") {
    throw new TypeError("Single-instance ownership requires an Electron app.");
  }
  if (typeof getMainWindow !== "function" || typeof isWindowClosing !== "function") {
    throw new TypeError("Single-instance ownership requires window state accessors.");
  }

  let readyWindow = null;
  let focusPending = false;
  let quitting = false;

  const requestPrimaryWindowFocus = () => {
    if (quitting || isWindowClosing()) {
      focusPending = false;
      return false;
    }

    const window = getMainWindow();
    if (!isUsableWindow(window) || window !== readyWindow) {
      focusPending = true;
      return false;
    }

    focusPending = false;
    if (window.isMinimized()) window.restore();
    if (!window.isVisible()) window.show();
    window.focus();
    return true;
  };

  const markWindowReady = (window) => {
    if (quitting || isWindowClosing() || !isUsableWindow(window) || window !== getMainWindow()) {
      return false;
    }

    readyWindow = window;
    return focusPending ? requestPrimaryWindowFocus() : false;
  };

  const markWindowClosed = (window) => {
    if (readyWindow === window) readyWindow = null;
  };

  const markQuitting = () => {
    quitting = true;
    focusPending = false;
  };

  const hasLock = app.requestSingleInstanceLock();
  if (!hasLock) {
    app.quit();
  } else {
    app.on("second-instance", requestPrimaryWindowFocus);
  }

  return {
    hasLock,
    markQuitting,
    markWindowClosed,
    markWindowReady,
    requestPrimaryWindowFocus
  };
}

function isUsableWindow(window) {
  return Boolean(window) && typeof window.isDestroyed === "function" && !window.isDestroyed();
}

module.exports = { acquireSingleInstanceOwnership };
