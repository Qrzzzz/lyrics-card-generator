"use strict";

/** @param {Electron.Rectangle} workArea */
function usableWindowArea(workArea) {
  // Native frameless thick-frame bounds can round outward by 1–2 DIP at
  // fractional Windows scales. Keep that physical border inside the work area.
  const inset = Math.min(2, Math.floor((Math.min(workArea.width, workArea.height) - 1) / 2));
  return { x: workArea.x + inset, y: workArea.y + inset, width: workArea.width - inset * 2, height: workArea.height - inset * 2 };
}

/** All rectangles are Electron DIP coordinates, including negative monitor origins.
 * @param {Electron.Rectangle} requested
 * @param {Electron.Rectangle} workArea
 * @returns {Electron.Rectangle}
 */
function fitWindowBounds(requested, workArea) {
  const area = usableWindowArea(workArea);
  const width = Math.min(Math.max(1, Math.round(requested.width)), area.width);
  const height = Math.min(Math.max(1, Math.round(requested.height)), area.height);
  return {
    x: Math.round(Math.max(area.x, Math.min(requested.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(requested.y, area.y + area.height - height))),
    width, height
  };
}

/** @param {Electron.Rectangle} workArea */
function windowMinimumSize(workArea) {
  const area = usableWindowArea(workArea);
  // 1366px at 125% leaves about 546 DIP per half-screen tile.
  return { minWidth: Math.min(520, area.width), minHeight: Math.min(480, area.height) };
}

/** @param {Electron.Rectangle} workArea */
function initialWindowGeometry(workArea) {
  const width = Math.min(1280, workArea.width);
  const height = Math.min(900, workArea.height);
  return {
    ...fitWindowBounds({
      x: workArea.x + (workArea.width - width) / 2,
      y: workArea.y + (workArea.height - height) / 2,
      width, height
    }, workArea),
    ...windowMinimumSize(workArea)
  };
}

/** Constrain after native movement/resize settles, not during a drag.
 * @param {Electron.BrowserWindow} window
 * @param {Electron.Screen} screen
 */
function watchWindowWorkArea(window, screen) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let applying = false;
  const fit = () => {
    if (window.isDestroyed() || applying) return;
    applying = true;
    try {
      const bounds = window.getBounds();
      const workArea = screen.getDisplayMatching(bounds).workArea;
      const minimum = windowMinimumSize(workArea);
      window.setMinimumSize(minimum.minWidth, minimum.minHeight);
      // A maximized/full-screen window belongs to the system compositor.
      if (window.isMaximized() || window.isFullScreen() || window.isMinimized()) return;
      const next = fitWindowBounds(bounds, workArea);
      if (next.x !== bounds.x || next.y !== bounds.y || next.width !== bounds.width || next.height !== bounds.height) {
        window.setBounds(next);
      }
    } finally { applying = false; }
  };
  const schedule = () => {
    if (applying) return;
    clearTimeout(timer);
    timer = setTimeout(fit, 100);
  };
  window.on("moved", schedule);
  window.on("resized", schedule);
  window.on("restore", schedule);
  window.on("unmaximize", schedule);
  screen.on("display-metrics-changed", schedule);
  screen.on("display-added", schedule);
  screen.on("display-removed", schedule);
  window.once("closed", () => {
    clearTimeout(timer);
    screen.removeListener("display-metrics-changed", schedule);
    screen.removeListener("display-added", schedule);
    screen.removeListener("display-removed", schedule);
  });
}

module.exports = { fitWindowBounds, initialWindowGeometry, windowMinimumSize, watchWindowWorkArea };
