const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const {
  LOOPBACK_HOST,
  MAX_ORIGIN_STATE_BYTES,
  ORIGIN_STATE_VERSION,
  deriveStableLoopbackPort,
  findAvailableLoopbackPort,
  isValidLoopbackPort,
  normalizeOriginState,
  readCachedLoopbackPort,
  selectLoopbackPort,
  writeCachedLoopbackPort
} = require("../electron/local-server-origin");

async function run() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lyrics-card-origin-test-"));
  try {
    await testStateValidation(temporaryRoot);
    await testStableSelectionAndOccupiedFallback(temporaryRoot);
    await testDeterministicFallbackSelection();
    await testRealLoopbackAllocation();
    await testPackagedServerParentLeash(temporaryRoot);
    console.log("Electron local server origin tests passed");
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function testStateValidation(temporaryRoot) {
  const statePath = path.join(temporaryRoot, "state", "desktop-server-origin.json");
  assert.equal(normalizeOriginState({ version: ORIGIN_STATE_VERSION, port: 43210 })?.port, 43210);
  for (const invalid of [
    null,
    [],
    { version: 0, port: 43210 },
    { version: ORIGIN_STATE_VERSION, port: 80 },
    { version: ORIGIN_STATE_VERSION, port: 65536 },
    { version: ORIGIN_STATE_VERSION, port: "43210" },
    { version: ORIGIN_STATE_VERSION, port: 43210, secret: "must-not-be-persisted" }
  ]) {
    assert.equal(normalizeOriginState(invalid), null);
  }

  await writeCachedLoopbackPort(statePath, 43210);
  assert.equal(await readCachedLoopbackPort(statePath), 43210);
  const serialized = JSON.parse(await fs.readFile(statePath, "utf8"));
  assert.deepEqual(serialized, { version: ORIGIN_STATE_VERSION, port: 43210 });
  assert.deepEqual(Object.keys(serialized).sort(), ["port", "version"]);
  assert.equal((await fs.readdir(path.dirname(statePath))).some((name) => name.endsWith(".tmp")), false);

  await fs.writeFile(statePath, "not-json", "utf8");
  assert.equal(await readCachedLoopbackPort(statePath), null, "corrupt state is a cache miss");
  await fs.writeFile(statePath, "x".repeat(MAX_ORIGIN_STATE_BYTES + 1), "utf8");
  assert.equal(await readCachedLoopbackPort(statePath), null, "oversized state is never parsed");
  await assert.rejects(() => writeCachedLoopbackPort(statePath, 80), /valid non-privileged loopback port/);
}

async function testStableSelectionAndOccupiedFallback(temporaryRoot) {
  const statePath = path.join(temporaryRoot, "occupied-origin.json");
  const occupied = net.createServer();
  await listen(occupied, 0);
  const occupiedPort = occupied.address().port;
  await writeCachedLoopbackPort(statePath, occupiedPort);
  try {
    const selection = await selectLoopbackPort({
      stateFilePath: statePath,
      profileSeed: `${temporaryRoot}-occupied`
    });
    assert.notEqual(selection.port, occupiedPort);
    assert.equal(selection.cachedPort, occupiedPort);
    assert.ok(["derived", "fallback"].includes(selection.source));
    assert.ok(isValidLoopbackPort(selection.port));
  } finally {
    await closeServer(occupied);
  }

  const stable = await selectLoopbackPort({
    stateFilePath: statePath,
    profileSeed: `${temporaryRoot}-stable`
  });
  assert.equal(stable.port, occupiedPort, "a released valid cached port is reused on the next launch");
  assert.equal(stable.source, "cached");
}

async function testDeterministicFallbackSelection() {
  const seed = "C:/Users/example/AppData/Roaming/lyrics-card-generator";
  assert.equal(deriveStableLoopbackPort(seed), deriveStableLoopbackPort(seed.toUpperCase()));
  assert.ok(deriveStableLoopbackPort(seed) >= 41000 && deriveStableLoopbackPort(seed) < 48000);

  const cachedPort = 42001;
  const derivedPort = deriveStableLoopbackPort(seed);
  const calls = [];
  const selection = await selectLoopbackPort({
    stateFilePath: "ignored",
    profileSeed: seed,
    readCachedPort: async () => cachedPort,
    findAvailablePort: async ({ host, port }) => {
      calls.push({ host, port });
      if (port === cachedPort || port === derivedPort) {
        const error = new Error("occupied");
        error.code = "EADDRINUSE";
        throw error;
      }
      assert.equal(port, 0);
      return 54321;
    }
  });
  assert.deepEqual(selection, {
    port: 54321,
    source: "fallback",
    cachedPort,
    derivedPort
  });
  assert.ok(calls.every((call) => call.host === LOOPBACK_HOST));

  await assert.rejects(
    () => selectLoopbackPort({
      stateFilePath: "ignored",
      profileSeed: seed,
      readCachedPort: async () => null,
      findAvailablePort: async () => {
        const error = new Error("unexpected network failure");
        error.code = "ENETDOWN";
        throw error;
      }
    }),
    /unexpected network failure/
  );
}

async function testRealLoopbackAllocation() {
  const port = await findAvailableLoopbackPort();
  assert.ok(isValidLoopbackPort(port));
  const rebound = net.createServer();
  try {
    await listen(rebound, port);
    assert.equal(rebound.address().address, LOOPBACK_HOST);
  } finally {
    await closeServer(rebound);
  }
  await assert.rejects(
    () => findAvailableLoopbackPort({ host: "0.0.0.0", port: 0 }),
    /must stay on 127\.0\.0\.1/
  );
}

async function testPackagedServerParentLeash(temporaryRoot) {
  const fixturePath = path.join(temporaryRoot, "server-fixture.cjs");
  await fs.writeFile(fixturePath, "setInterval(() => undefined, 1000);\n", "utf8");
  const launcherPath = path.resolve("electron", "packaged-next-server.js");
  const child = spawn(process.execPath, [launcherPath, fixturePath], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    windowsHide: true
  });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  assert.equal(child.exitCode, null);
  child.disconnect();
  const exit = await waitForExit(child, 5_000);
  assert.equal(exit.code, 0, `parent IPC disconnect stops the server; stderr=${exit.stderr}`);
  assert.equal(exit.signal, null);
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, LOOPBACK_HOST, resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function waitForExit(child, timeoutMs) {
  let stderr = "";
  child.stderr?.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`child ${child.pid} did not exit`)), timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stderr });
    });
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
