import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const projectRoot = process.cwd();
const lifecycleOnly = process.argv.includes("--server-lifecycle-only");
const server = spawn(process.execPath, [path.join(projectRoot, ".next", "standalone", "server.js")], {
  cwd: projectRoot,
  env: {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: "3101"
  },
  stdio: "inherit",
  windowsHide: true
});

let stopping = false;

try {
  await waitForServer("http://127.0.0.1:3101", server);
  if (lifecycleOnly) {
    process.exitCode = 0;
  } else {
    const playwright = spawn(
      process.execPath,
      [
        path.join(projectRoot, "node_modules", "@playwright", "test", "cli.js"),
        "test",
        "--config=playwright.render-boundaries.config.ts"
      ],
      {
        cwd: projectRoot,
        env: process.env,
        stdio: "inherit",
        windowsHide: true
      }
    );
    const [code] = await once(playwright, "exit");
    process.exitCode = typeof code === "number" ? code : 1;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopServer();
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Render-boundary server exited before readiness (${child.exitCode}).`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The standalone server is still binding its local port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the render-boundary server.");
}

async function stopServer() {
  if (stopping || server.exitCode !== null) return;
  stopping = true;
  server.kill("SIGTERM");
  if (await waitForExit(server, 2_000)) return;

  if (process.platform === "win32" && server.pid) {
    const taskkill = spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    await once(taskkill, "exit");
    if (await waitForExit(server, 2_000)) return;
  }
  server.kill("SIGKILL");
  if (await waitForExit(server, 2_000)) return;
  server.unref();
  throw new Error(`Unable to stop render-boundary server process ${server.pid}.`);
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve(false);
    }, timeoutMs);
    child.once("exit", onExit);
  });
}
