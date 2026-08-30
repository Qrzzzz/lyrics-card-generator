import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { validateDesktopRuntimePolicy } from "./desktop-runtime-dependency-policy.mjs";

if (process.platform !== "win32") throw new Error("Final Windows artifact smoke must run on Windows.");

const execFileAsync = promisify(execFile);
const root = process.cwd();
const releaseDirectory = path.join(root, "release");
const reportDirectory = path.join(root, "playwright-report", "desktop-final-artifacts");
await mkdir(reportDirectory, { recursive: true });

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.match(packageJson.version, /^\d+\.\d+\.\d+$/, "package version must be a stable semantic version");
const runtimePolicy = JSON.parse(await readFile(path.join(root, "security", "desktop-runtime-audit.json"), "utf8"));
const runtimeRoots = validateDesktopRuntimePolicy(runtimePolicy);
assert.deepEqual(runtimeRoots.map((entry) => entry.name), ["electron"], "final artifact smoke expects Electron as the desktop runtime root");
const electronRoot = runtimeRoots[0];
const expectedElectronVersion = packageJson[electronRoot.manifestSection]?.[electronRoot.name];
assert.match(expectedElectronVersion ?? "", /^\d+\.\d+\.\d+$/, "the final artifact Electron version must be pinned exactly");
const artifacts = await readdir(releaseDirectory);
const portableName = `Lyrics Card Generator-${packageJson.version}-portable.exe`;
const setupName = `Lyrics Card Generator Setup ${packageJson.version}.exe`;
assert.ok(artifacts.includes(portableName), `${portableName} is missing`);
assert.ok(artifacts.includes(setupName), `${setupName} is missing`);

const fontLicenseContracts = [
  {
    fontUrl: "/fonts/SourceHanSansSC-Heavy.otf",
    licenseUrl: "/fonts/LICENSE-SourceHanSans.txt",
    licenseSha256: "f55c2d43dd905011515f5e46ba78d180027e314ef8ccaaf53a9e88fe316767cd"
  },
  {
    fontUrl: "/fonts/SourceHanSerifSC-Heavy.otf",
    licenseUrl: "/fonts/LICENSE-SourceHanSerif.txt",
    licenseSha256: "9ff5bb567e1b92c801fc1069e5fbf992ff8efccacb9db94e5959a5b3ba9bb903"
  }
];

const results = [];
// Exercise the portable binary first, then validate the installer through an
// isolated silent install so neither path depends on the developer profile.
const portablePath = path.join(releaseDirectory, portableName);
const setupPath = path.join(releaseDirectory, setupName);
await smokeExecutable(portablePath, "portable", results, portablePath);

const installDirectory = await mkdtemp(path.join(tmpdir(), "lyrics-card-setup-"));
try {
  await execFileAsync(setupPath, ["/S", `/D=${installDirectory}`], {
    timeout: 180_000,
    windowsHide: true
  });
  const installedExecutable = await findNamedFile(installDirectory, "Lyrics Card Generator.exe");
  assert.ok(installedExecutable, "Setup did not install the application executable");
  await smokeExecutable(installedExecutable, "setup", results, setupPath);
  const uninstaller = await findFileMatching(installDirectory, /^Uninstall.*\.exe$/i);
  assert.ok(uninstaller, "Setup did not install an uninstaller");
  await execFileAsync(uninstaller, ["/S"], { timeout: 180_000, windowsHide: true });
} finally {
  await rm(installDirectory, { recursive: true, force: true }).catch(() => undefined);
}

await writeFile(path.join(reportDirectory, "results.json"), JSON.stringify({ ok: true, results }, null, 2));
console.log("Setup and portable final-artifact smoke tests passed");

async function smokeExecutable(executablePath, label, results, sourceArtifactPath) {
  // The NSIS portable launcher does not forward stdout from its extracted
  // Electron child. The installed executable can be probed directly; both
  // final forms are independently checked again through their renderer UA.
  const processElectronVersion = label === "setup" ? await probeElectronVersion(executablePath) : null;
  if (processElectronVersion) {
    assert.equal(
      processElectronVersion,
      expectedElectronVersion,
      `${label} process.versions.electron is ${processElectronVersion}, expected ${expectedElectronVersion}`
    );
  }
  const artifactSha256 = await sha256File(sourceArtifactPath);
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
    // CDP verifies the packaged renderer without injecting test-only code into
    // the application bundle.
    browser = await connectToElectron(debuggingPort, 90_000);
    const page = await waitForApplicationPage(browser, 90_000);
    await page.getByTestId("editor-surface").waitFor({ state: "visible", timeout: 60_000 });
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const electronVersion = /\bElectron\/(\d+\.\d+\.\d+)\b/u.exec(userAgent)?.[1];
    assert.equal(
      electronVersion,
      expectedElectronVersion,
      `${label} renderer user agent does not report Electron ${expectedElectronVersion}: ${userAgent}`
    );
    if (processElectronVersion) {
      assert.equal(electronVersion, processElectronVersion, `${label} renderer and process Electron versions must agree`);
    }
    const languageDialog = page.getByTestId("first-launch-language-dialog");
    await languageDialog.waitFor({ state: "visible", timeout: 30_000 });
    await page.locator('[data-testid="first-launch-language"][data-locale="en"]').click();
    await languageDialog.waitFor({ state: "hidden", timeout: 15_000 });
    const search = page.getByRole("combobox").first();
    await search.waitFor({ state: "visible" });
    await search.fill("final artifact smoke");
    assert.equal(await search.inputValue(), "final artifact smoke");
    await assertPackagedFontLicenses(page, label);

    const closed = new Promise((resolve) => browser.once("disconnected", resolve));
    await page.evaluate(() => window.lyricsCardDesktop?.closeWindow());
    await withTimeout(closed, 30_000, `${label} did not exit cleanly`);
    results.push({
      label,
      artifact: path.basename(sourceArtifactPath),
      artifactSha256,
      executable: path.basename(executablePath),
      electronVersion,
      electronVersionEvidence: processElectronVersion
        ? "process.versions.electron+renderer-user-agent"
        : "renderer-user-agent",
      interaction: true,
      fontLicenses: true,
      cleanExit: true
    });
  } catch (error) {
    const page = browser?.contexts().flatMap((context) => context.pages())[0];
    await page?.screenshot({ path: path.join(reportDirectory, `${label}-failure.png`) }).catch(() => undefined);
    throw new Error(`${label} final-artifact smoke failed. ${output}`, { cause: error });
  } finally {
    // Always terminate the complete process tree because a failed renderer can
    // leave the packaged Next.js child alive after Electron disconnects.
    await browser?.close().catch(() => undefined);
    if (!processExited) await terminateProcessTree(launched.pid);
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function probeElectronVersion(executablePath) {
  const { stdout } = await execFileAsync(executablePath, ["-p", "process.versions.electron"], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    timeout: 90_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  const version = stdout.trim();
  assert.match(version, /^\d+\.\d+\.\d+$/, `${path.basename(executablePath)} did not report process.versions.electron`);
  return version;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

async function assertPackagedFontLicenses(page, label) {
  const responses = await page.evaluate(async (contracts) => Promise.all(contracts.map(async (contract) => {
    const fontResponse = await fetch(contract.fontUrl, { method: "HEAD", cache: "no-store" });
    const licenseResponse = await fetch(contract.licenseUrl, { cache: "no-store" });
    return {
      ...contract,
      fontOk: fontResponse.ok,
      fontStatus: fontResponse.status,
      licenseOk: licenseResponse.ok,
      licenseStatus: licenseResponse.status,
      licenseText: licenseResponse.ok ? await licenseResponse.text() : ""
    };
  })), fontLicenseContracts);

  for (const response of responses) {
    assert.equal(response.fontOk, true, `${label} is missing ${response.fontUrl} (HTTP ${response.fontStatus})`);
    assert.equal(response.licenseOk, true, `${label} is missing ${response.licenseUrl} (HTTP ${response.licenseStatus})`);
    assert.equal(
      crypto.createHash("sha256").update(response.licenseText, "utf8").digest("hex"),
      response.licenseSha256,
      `${label} serves reviewed upstream bytes for ${response.licenseUrl}`
    );
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
