const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const {
  DESKTOP_READY_CHALLENGE_HEADER,
  DESKTOP_READY_PATH,
  DESKTOP_READY_SERVICE,
  STARTUP_SECRET_ENV,
  createPackagedServerStartupSecret,
  isChildProcessAlive,
  waitForPackagedServerReady
} = require("../electron/packaged-server-readiness");

const HOST = "127.0.0.1";
const TEST_TIMEOUT_MS = 2500;

// Spawn a real child HTTP service so readiness tests cover child-process
// exit/error signals, challenge-response authentication, and port decoys together.
const fixtureSource = String.raw`
const crypto = require("node:crypto");
const http = require("node:http");
const host = "127.0.0.1";
const mode = process.env.FIXTURE_MODE;
const readyPath = process.env.FIXTURE_READY_PATH;
const challengeHeader = process.env.FIXTURE_CHALLENGE_HEADER;
const service = process.env.FIXTURE_SERVICE;
const secret = process.env.LYRICS_CARD_SERVER_STARTUP_SECRET;
const server = http.createServer((request, response) => {
  if (request.url !== readyPath) {
    response.writeHead(404).end();
    return;
  }
  if (mode === "wrong-status") {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("decoy-service");
    return;
  }
  const challenge = request.headers[challengeHeader] || "";
  const proof = mode === "wrong-proof"
    ? "0".repeat(64)
    : crypto.createHmac("sha256", secret).update(challenge).digest("hex");
  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ service, proof }));
});
server.listen(0, host, () => {
  process.send({ port: server.address().port });
});
`;

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => resolve(server.address().port));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function spawnFixture(mode, startupSecret) {
  return spawn(process.execPath, ["-e", fixtureSource], {
    env: {
      ...process.env,
      [STARTUP_SECRET_ENV]: startupSecret,
      FIXTURE_MODE: mode,
      FIXTURE_READY_PATH: DESKTOP_READY_PATH,
      FIXTURE_CHALLENGE_HEADER: DESKTOP_READY_CHALLENGE_HEADER,
      FIXTURE_SERVICE: DESKTOP_READY_SERVICE
    },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    windowsHide: true
  });
}

function waitForFixturePort(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("fixture did not announce its port")), TEST_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      child.removeListener("message", onMessage);
    };
    const finish = (error, port) => {
      cleanup();
      if (error) reject(error);
      else resolve(port);
    };
    const onError = (error) => finish(error);
    const onExit = (code, signal) => finish(new Error(`fixture exited code=${code} signal=${signal}`));
    const onMessage = (message) => {
      if (Number.isInteger(message?.port) && message.port > 0 && message.port <= 65535) {
        finish(null, message.port);
      }
    };
    child.once("error", onError);
    child.once("exit", onExit);
    child.on("message", onMessage);
  });
}

async function waitForChildExit(child, timeoutMs = TEST_TIMEOUT_MS) {
  if (!isChildProcessAlive(child)) return { code: child.exitCode, signal: child.signalCode };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`child ${child.pid} did not exit`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      child.removeListener("exit", onExit);
    };
    const onExit = (code, signal) => {
      cleanup();
      resolve({ code, signal });
    };
    child.once("exit", onExit);
  });
}

async function stopChild(child) {
  if (!isChildProcessAlive(child)) return;
  child.kill();
  await waitForChildExit(child);
}

function readinessOptions(url, child, startupSecret) {
  return {
    url,
    child,
    startupSecret,
    timeoutMs: TEST_TIMEOUT_MS,
    retryDelayMs: 20,
    requestTimeoutMs: 500
  };
}

async function testAuthenticatedNormalStartup() {
  const startupSecret = createPackagedServerStartupSecret();
  const child = spawnFixture("normal", startupSecret);
  try {
    const port = await waitForFixturePort(child);
    await waitForPackagedServerReady(readinessOptions(`http://${HOST}:${port}`, child, startupSecret));
    assert.equal(isChildProcessAlive(child), true, "authenticated readiness keeps the intended child alive");
  } finally {
    await stopChild(child);
  }
}

async function testWrongStatusFailsClosed() {
  const startupSecret = createPackagedServerStartupSecret();
  const child = spawnFixture("wrong-status", startupSecret);
  try {
    const port = await waitForFixturePort(child);
    await assert.rejects(
      waitForPackagedServerReady(readinessOptions(`http://${HOST}:${port}`, child, startupSecret)),
      /untrusted readiness response \(status=503\)/
    );
  } finally {
    await stopChild(child);
  }
}

async function testWrongProofFailsClosed() {
  const startupSecret = createPackagedServerStartupSecret();
  const child = spawnFixture("wrong-proof", startupSecret);
  try {
    const port = await waitForFixturePort(child);
    await assert.rejects(
      waitForPackagedServerReady(readinessOptions(`http://${HOST}:${port}`, child, startupSecret)),
      /untrusted readiness response \(identity-proof\)/
    );
  } finally {
    await stopChild(child);
  }
}

async function testEarlyChildExitRejectsImmediately() {
  const delayedServer = http.createServer(() => undefined);
  const port = await listen(delayedServer);
  const child = spawn(process.execPath, ["-e", "setTimeout(() => process.exit(19), 25)"], {
    stdio: "ignore",
    windowsHide: true
  });
  const startedAt = Date.now();
  try {
    await assert.rejects(
      waitForPackagedServerReady(readinessOptions(
        `http://${HOST}:${port}`,
        child,
        createPackagedServerStartupSecret()
      )),
      /exited before readiness \(code=19, signal=none\)/
    );
    assert.ok(Date.now() - startedAt < 1000, "child exit rejects without waiting for the readiness timeout");
  } finally {
    await waitForChildExit(child);
    await closeServer(delayedServer);
  }
}

async function testSpawnFailureRejectsThroughReadiness() {
  const missingExecutable = `lyrics-card-missing-executable-${process.pid}-${Date.now()}`;
  const child = spawn(missingExecutable, [], {
    stdio: "ignore",
    windowsHide: true
  });

  await assert.rejects(
    waitForPackagedServerReady(readinessOptions(
      `http://${HOST}:3210`,
      child,
      createPackagedServerStartupSecret()
    )),
    /Unable to start bundled Next service:.*ENOENT/
  );
  assert.equal(child.listenerCount("error"), 0, "spawn-failure listeners are cleaned after rejection");
}

async function testPortCompetitionAndDecoyFailClosed() {
  // A healthy but unauthenticated listener on the chosen port must never be
  // mistaken for the child process that Electron launched.
  const decoy = http.createServer((_request, response) => {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("decoy-service");
  });
  const port = await listen(decoy);
  const intendedSource = String.raw`
const http = require("node:http");
const server = http.createServer((_request, response) => response.end("intended"));
server.once("error", (error) => {
  process.stderr.write(String(error.code), () => {
    process.exit(error.code === "EADDRINUSE" ? 23 : 24);
  });
});
server.listen(Number(process.env.FIXTURE_PORT), "127.0.0.1");
`;
  const intended = spawn(process.execPath, ["-e", intendedSource], {
    env: { ...process.env, FIXTURE_PORT: String(port) },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true
  });
  let intendedError = "";
  intended.stderr.on("data", (chunk) => { intendedError += chunk.toString(); });
  try {
    await assert.rejects(
      waitForPackagedServerReady(readinessOptions(
        `http://${HOST}:${port}`,
        intended,
        createPackagedServerStartupSecret()
      )),
      /(?:untrusted readiness response \(status=503\)|exited before readiness)/
    );
    const exit = await waitForChildExit(intended);
    assert.equal(exit.code, 23, "the intended server deterministically exits on EADDRINUSE");
    assert.match(intendedError, /EADDRINUSE/, "the intended child observed the occupied decoy port");
  } finally {
    if (isChildProcessAlive(intended)) await stopChild(intended);
    await closeServer(decoy);
  }
}

async function run() {
  await testAuthenticatedNormalStartup();
  await testWrongStatusFailsClosed();
  await testWrongProofFailsClosed();
  await testSpawnFailureRejectsThroughReadiness();
  await testEarlyChildExitRejectsImmediately();
  await testPortCompetitionAndDecoyFailClosed();
  console.log("Electron packaged server startup tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
