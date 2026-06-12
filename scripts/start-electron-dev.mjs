import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const host = "127.0.0.1";

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

const port = await getAvailablePort();
const url = `http://${host}:${port}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const electronCommand = process.platform === "win32" ? "electron.cmd" : "electron";

const nextDev = spawnChild(npmCommand, ["run", "dev", "--", "-H", host, "-p", String(port)]);

const electron = spawnChild(electronCommand, ["."], {
  ELECTRON_DEV_SERVER_URL: url
});

function shutdown() {
  nextDev.kill();
  electron.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

electron.on("exit", (code) => {
  nextDev.kill();
  process.exit(code ?? 0);
});

