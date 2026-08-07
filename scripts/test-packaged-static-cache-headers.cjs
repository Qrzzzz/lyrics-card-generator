const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  findAvailableLoopbackPort
} = require("../electron/local-server-origin");
const {
  DESKTOP_READY_CHALLENGE_HEADER,
  DESKTOP_READY_PATH,
  STARTUP_SECRET_ENV,
  createPackagedServerProof,
  createPackagedServerStartupSecret,
  waitForPackagedServerReady
} = require("../electron/packaged-server-readiness");

const root = path.resolve(__dirname, "..");
const executablePath = path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe");
const serverDirectory = path.join(path.dirname(executablePath), "resources", "server");
const serverEntry = path.join(serverDirectory, "server.js");
const serverLauncher = path.join(serverDirectory, "desktop-server-launcher.cjs");
const standaloneNodeModules = path.join(serverDirectory, "_node_modules");

async function run() {
  for (const target of [executablePath, serverEntry, serverLauncher]) {
    assert.ok(fs.existsSync(target), `required packaged file exists: ${target}`);
  }
  const port = await findAvailableLoopbackPort();
  const url = `http://127.0.0.1:${port}`;
  const secret = createPackagedServerStartupSecret();
  const child = spawn(executablePath, [serverLauncher, serverEntry], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      NODE_PATH: process.env.NODE_PATH
        ? `${standaloneNodeModules}${path.delimiter}${process.env.NODE_PATH}`
        : standaloneNodeModules,
      PORT: String(port),
      [STARTUP_SECRET_ENV]: secret
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12_000); });
  child.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12_000); });

  try {
    await waitForPackagedServerReady({ url, child, startupSecret: secret, timeoutMs: 45_000 });
    const staticRelativePath = findFirstFile(path.join(serverDirectory, ".next", "static"), (name) => name.endsWith(".js"));
    assert.ok(staticRelativePath, "the packaged Next static tree contains JavaScript");
    const targets = {
      nextStatic: `/_next/static/${path.relative(path.join(serverDirectory, ".next", "static"), staticRelativePath).replaceAll(path.sep, "/")}`,
      font: "/fonts/SourceHanSansSC-Heavy.otf?v=4a8b2ee4f041fa56",
      appIcon: "/app-icon.png?v=b3e613afa7695f7f"
    };
    const evidence = {};
    for (const [name, target] of Object.entries(targets)) {
      const response = await request(url, target, { method: "HEAD" });
      assert.equal(response.status, 200, `${name} is served by the packaged app`);
      assert.equal(response.headers["cache-control"], "public, max-age=31536000, immutable", `${name} is immutable`);
      assert.match(String(response.headers["content-security-policy"]), /default-src 'self'/);
      evidence[name] = {
        path: target,
        cacheControl: response.headers["cache-control"],
        contentLength: Number(response.headers["content-length"] ?? 0),
        contentType: response.headers["content-type"]
      };
    }

    const unauthenticated = await request(url, DESKTOP_READY_PATH);
    assert.equal(unauthenticated.status, 404);
    assert.equal(unauthenticated.headers["cache-control"], "no-store");
    const challenge = crypto.randomBytes(32).toString("hex");
    const authenticated = await request(url, DESKTOP_READY_PATH, {
      headers: { [DESKTOP_READY_CHALLENGE_HEADER]: challenge }
    });
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.headers["cache-control"], "no-store");
    assert.equal(JSON.parse(authenticated.body).proof, createPackagedServerProof(secret, challenge));
    evidence.readiness = { unauthenticatedStatus: 404, authenticatedStatus: 200, cacheControl: "no-store" };
    console.log(JSON.stringify({ ok: true, port, evidence }, null, 2));
  } finally {
    if (child.connected) child.send({ type: "lyrics-card:shutdown-server" }, () => undefined);
    await waitForExit(child, 10_000).catch(async () => {
      child.kill("SIGKILL");
      await waitForExit(child, 5_000).catch(() => undefined);
    });
    assert.notEqual(child.exitCode, null, `packaged server exits cleanly; output=${output}`);
  }
}

function findFirstFile(directory, predicate) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findFirstFile(target, predicate);
      if (found) return found;
    } else if (entry.isFile() && predicate(entry.name)) {
      return target;
    }
  }
  return "";
}

function request(origin, target, { method = "GET", headers = {} } = {}) {
  const url = new URL(target, origin);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers, agent: false }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.once("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error(`request timed out: ${url}`)));
    req.end();
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`child ${child.pid} did not exit`)), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
