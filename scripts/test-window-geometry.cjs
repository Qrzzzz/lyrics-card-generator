const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { fitWindowBounds, initialWindowGeometry, watchWindowWorkArea } = require("../electron/window-geometry");

async function main() {
  // Areas are already in DIP: scaling again would incorrectly shrink windows.
  for (const area of [
    { x: 0, y: 0, width: 1093, height: 574 },
    { x: 0, y: 0, width: 1280, height: 680 },
    { x: -1536, y: -40, width: 1536, height: 824 },
    { x: 1920, y: 100, width: 640, height: 360 }
  ]) {
    const initial = initialWindowGeometry(area);
    assert.ok(initial.x >= area.x && initial.y >= area.y);
    assert.ok(initial.x + initial.width <= area.x + area.width);
    assert.ok(initial.y + initial.height <= area.y + area.height);
    assert.ok(initial.minWidth <= initial.width && initial.minHeight <= initial.height);
    if (area.width >= 1040) assert.ok(initial.minWidth <= area.width / 2, "minimum width permits a half-screen tile");
    const restored = fitWindowBounds({ x: -5000, y: 5000, width: 2400, height: 1800 }, area);
    assert.equal(restored.x, area.x + 2);
    assert.equal(restored.y, area.y + 2);
    assert.equal(restored.width, area.width - 4);
    assert.equal(restored.height, area.height - 4);
  }
  const screen = new EventEmitter();
  const window = new EventEmitter();
  let bounds = { x: 2100, y: 30, width: 1280, height: 900 };
  let area = { x: 1920, y: 0, width: 1093, height: 574 };
  let maximized = false;
  let changes = 0;
  Object.assign(screen, { getDisplayMatching: () => ({ workArea: area }) });
  Object.assign(window, { isDestroyed: () => false, getBounds: () => bounds,
    setBounds: (next) => { bounds = next; changes++; }, setMinimumSize: (w, h) => { assert.ok(w <= area.width && h <= area.height); },
    isMaximized: () => maximized, isFullScreen: () => false, isMinimized: () => false });
  watchWindowWorkArea(window, screen);
  screen.emit("display-metrics-changed");
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.deepEqual(bounds, { x: 1922, y: 2, width: 1089, height: 570 });
  maximized = true;
  area = { x: 0, y: 0, width: 800, height: 500 };
  screen.emit("display-removed");
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(changes, 1, "the system owns maximized bounds");
  maximized = false;
  window.emit("unmaximize");
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.deepEqual(bounds, { x: 2, y: 2, width: 796, height: 496 });
  window.emit("closed");
  assert.equal(screen.listenerCount("display-metrics-changed"), 0);
  assert.equal(screen.listenerCount("display-removed"), 0);
  console.log("Window work-area contracts passed (simulated displays; native DPI acceptance remains separate).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
