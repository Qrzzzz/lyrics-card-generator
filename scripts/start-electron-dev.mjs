import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }

        reject(new Error("Unable to allocate a local dev port."));
      });
    });
  });
}

function spawnChild(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    shell: false,
    stdio: "inherit",
    windowsHide: true
  });

  child.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });

  return child;
}

// Allocate a fresh loopback port so parallel worktrees do not collide on a
// shared development server address.
const port = await getAvailablePort();
const url = `http://${host}:${port}`;
const nextCommand = process.execPath;
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const electronCommand = process.platform === "win32"
  ? path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe")
  : path.join(projectRoot, "node_modules", "electron", "dist", "electron");

const nextDev = spawnChild(nextCommand, [nextBin, "dev", "-H", host, "-p", String(port)]);

const electron = spawnChild(electronCommand, ["."], {
  ELECTRON_DEV_SERVER_URL: url
});

function shutdown() {
  // The launcher owns both children; neither should survive a terminal signal.
  nextDev.kill();
  electron.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

electron.on("exit", (code) => {
  nextDev.kill();
  process.exit(code ?? 0);
});
