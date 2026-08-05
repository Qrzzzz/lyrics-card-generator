import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function hasExited(childProcess) {
  return Boolean(childProcess)
    && (childProcess.exitCode !== null || childProcess.signalCode !== null);
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForProcessExit(childProcess, label, timeoutMs = 5_000) {
  if (!childProcess || hasExited(childProcess)) return;
  await withTimeout(
    new Promise((resolve) => childProcess.once("exit", resolve)),
    timeoutMs,
    `Electron process ${childProcess.pid ?? "unknown"} did not exit within ${timeoutMs}ms`
  ).catch((error) => {
    process.stderr.write(`[${label}-cleanup] ${formatError(error)}\n`);
  });
}

export async function closeElectronApplication(app, {
  label = "desktop-regression",
  timeoutMs = 15_000
} = {}) {
  if (!app) return;

  let childProcess;
  try {
    childProcess = app.process();
  } catch {
    childProcess = undefined;
  }

  if (hasExited(childProcess)) return;

  try {
    await withTimeout(app.close(), timeoutMs, `Electron did not close within ${timeoutMs}ms`);
    return;
  } catch (error) {
    process.stderr.write(
      `[${label}-cleanup] ${formatError(error)}; terminating owned Electron process ${childProcess?.pid ?? "unknown"}.\n`
    );
  }

  const pid = childProcess?.pid;
  if (!pid || hasExited(childProcess)) return;

  if (process.platform === "win32") {
    await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      timeout: 10_000
    }).catch((error) => {
      if (!hasExited(childProcess)) {
        process.stderr.write(`[${label}-cleanup] Could not terminate Electron process ${pid}: ${formatError(error)}\n`);
        try {
          childProcess.kill("SIGKILL");
        } catch (killError) {
          process.stderr.write(
            `[${label}-cleanup] Direct termination of Electron process ${pid} also failed: ${formatError(killError)}\n`
          );
        }
      }
    });
    await waitForProcessExit(childProcess, label);
    return;
  }

  childProcess.kill("SIGKILL");
  await waitForProcessExit(childProcess, label);
}
