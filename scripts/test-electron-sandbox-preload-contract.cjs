const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

const exposed = new Map();
const blockedImports = [];
const electronMock = {
  contextBridge: {
    exposeInMainWorld(name, bridge) { exposed.set(name, bridge); }
  },
  ipcRenderer: {
    invoke: () => Promise.resolve(false),
    on: () => undefined,
    removeListener: () => undefined
  },
  webUtils: {
    getPathForFile: () => ""
  }
};

const preloadSource = readFileSync("electron/preload.js", "utf8");
const context = vm.createContext({
  Promise,
  Set,
  require(request) {
    if (request === "electron") return electronMock;
    blockedImports.push(request);
    throw new Error(`Sandboxed preload import blocked: ${request}`);
  }
});

assert.doesNotThrow(
  () => new vm.Script(preloadSource, { filename: "electron/preload.js" }).runInContext(context),
  "a sandboxed preload must be self-contained apart from Electron's allowlisted module"
);
assert.deepEqual(blockedImports, [], "sandboxed preload does not request local CommonJS modules");
assert.equal(
  typeof exposed.get("lyricsCardDesktopBridge")?.copyImageToClipboard,
  "function",
  "the restricted sandbox resolver still reaches contextBridge exposure"
);
console.log("Electron sandbox preload resolver contract passed");
