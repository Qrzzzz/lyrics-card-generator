import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { promisify } from "node:util";
import { chromium } from "playwright";

if (process.platform !== "win32") throw new Error("Final Windows artifact smoke must run on Windows.");

const execFileAsync = promisify(execFile);
const root = process.cwd();
const releaseDirectory = path.join(root, "release");
const reportDirectory = path.join(root, "playwright-report", "desktop-final-artifacts");
await mkdir(reportDirectory, { recursive: true });

const artifacts = await readdir(releaseDirectory);
const portableName = artifacts.find((name) => /^Lyrics Card Generator-.*-portable\.exe$/i.test(name));
const setupName = artifacts.find((name) => /^Lyrics Card Generator Setup .*\.exe$/i.test(name));
assert.ok(portableName, "portable artifact is missing");
assert.ok(setupName, "Setup artifact is missing");

const results = [];
await smokeExecutable(path.join(releaseDirectory, portableName), "portable", results);

const installDirectory = await mkdtemp(path.join(tmpdir(), "lyrics-card-setup-"));
try {
  await execFileAsync(path.join(releaseDirectory, setupName), ["/S", `/D=${installDirectory}`], {
    timeout: 180_000,
    windowsHide: true
  });
  const installedExecutable = await findNamedFile(installDirectory, "Lyrics Card Generator.exe");
  assert.ok(installedExecutable, "Setup did not install the application executable");
  await smokeExecutable(installedExecutable, "setup", results);
  const uninstaller = await findFileMatching(installDirectory, /^Uninstall.*\.exe$/i);
  assert.ok(uninstaller, "Setup did not install an uninstaller");
  await execFileAsync(uninstaller, ["/S"], { timeout: 180_000, windowsHide: true });
} finally {
  await rm(installDirectory, { recursive: true, force: true }).catch(() => undefined);
}

await writeFile(path.join(reportDirectory, "results.json"), JSON.stringify({ ok: true, results }, null, 2));
console.log("Setup and portable final-artifact smoke tests passed");

async function smokeExecutable(executablePath, label, results) {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), `lyrics-card-${label}-user-data-`));
  const debuggingPort = await getAvailablePort();
  let browser;
  let processExited = false;
  let output = "";
  const launched = spawn(executablePath, [`--remote-debugging-port=${debuggingPort}`], {
    env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: userDataDirectory },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  launched.once("exit", () => { processExited = true; });
  launched.stdout?.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12_000); });
  launched.stderr?.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12_000); });
  try {
    browser = await connectToElectron(debuggingPort, 90_000);
    const page = await waitForApplicationPage(browser, 90_000);
    await page.getByTestId("editor-surface").waitFor({ state: "visible", timeout: 60_000 });
    const languageDialog = page.getByTestId("first-launch-language-dialog");
    await languageDialog.waitFor({ state: "visible", timeout: 30_000 });
    await page.locator('[data-testid="first-launch-language"][data-locale="en"]').click();
    await languageDialog.waitFor({ state: "hidden", timeout: 15_000 });
    const search = page.getByRole("combobox").first();
    await search.waitFor({ state: "visible" });
    await search.fill("final artifact smoke");
    assert.equal(await search.inputValue(), "final artifact smoke");

    const closed = new Promise((resolve) => browser.once("disconnected", resolve));
    await page.evaluate(() => window.lyricsCardDesktop?.closeWindow());
    await withTimeout(closed, 30_000, `${label} did not exit cleanly`);
    results.push({ label, executable: path.basename(executablePath), interaction: true, cleanExit: true });
  } catch (error) {
    const page = browser?.contexts().flatMap((context) => context.pages())[0];
    await page?.screenshot({ path: path.join(reportDirectory, `${label}-failure.png`) }).catch(() => undefined);
    throw new Error(`${label} final-artifact smoke failed. ${output}`, { cause: error });
  } finally {
    await browser?.close().catch(() => undefined);
    if (!processExited) await terminateProcessTree(launched.pid);
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function connectToElectron(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1_000 });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(`Timed out connecting to Electron DevTools on ${port}`, { cause: lastError });
}

async function waitForApplicationPage(browser, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().startsWith("http://127.0.0.1:"));
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for the packaged application page.");
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Unable to allocate a debugging port."));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function terminateProcessTree(pid) {
  if (!pid) return;
  await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }).catch(() => undefined);
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function findNamedFile(directory, fileName) {
  return findFileMatching(directory, new RegExp(`^${escapeRegExp(fileName)}$`, "i"));
}

async function findFileMatching(directory, pattern) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFileMatching(target, pattern);
      if (nested) return nested;
    } else if (pattern.test(entry.name)) {
      return target;
    }
  }
  return undefined;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
