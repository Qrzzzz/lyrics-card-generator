import assert from "node:assert/strict";
import { prepareEditorLanguage } from "./editor-language-test-helpers.mjs";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { _electron as electron } from "playwright";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";
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
const setupName = `Lyrics.Card.Generator.Setup.${packageJson.version}.exe`;
const releaseExecutables = artifacts.filter((name) => name.toLowerCase().endsWith(".exe"));
assert.deepEqual(releaseExecutables, [setupName], "the final Windows artifact set must contain only the x64 Setup executable");

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
// Validate the distributable Setup bytes through an isolated silent install so
// the smoke does not depend on the developer profile.
const setupPath = path.join(releaseDirectory, setupName);
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
console.log("Setup-only final-artifact smoke tests passed");

async function smokeExecutable(executablePath, label, results, sourceArtifactPath) {
  const processElectronVersion = await probeElectronVersion(executablePath);
  assert.equal(
    processElectronVersion,
    expectedElectronVersion,
    `${label} process.versions.electron is ${processElectronVersion}, expected ${expectedElectronVersion}`
  );
  const artifactSha256 = await sha256File(sourceArtifactPath);
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), `lyrics-card-${label}-user-data-`));
  let application;
  let output = "";
  try {
    // Use the same Electron driver as packaged CI. It observes window creation
    // and navigation, including a hidden about:blank startup window, instead of
    // polling a separate CDP browser that can omit Electron renderer contexts.
    application = await electron.launch({
      executablePath,
      env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: userDataDirectory, LYRICS_CARD_STARTUP_TRACE: "1" },
      timeout: 90_000
    });
    const launched = application.process();
    launched.stdout?.on("data", chunk => { output = `${output}${chunk}`.slice(-12_000); });
    launched.stderr?.on("data", chunk => { output = `${output}${chunk}`.slice(-12_000); });
    const page = await application.firstWindow({ timeout: 90_000 });
    await page.waitForURL(url => url.protocol === "http:" && url.hostname === "127.0.0.1", { timeout: 90_000 });
    await page.getByTestId("editor-surface").waitFor({ state: "visible", timeout: 60_000 });
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const electronVersion = /\bElectron\/(\d+\.\d+\.\d+)\b/u.exec(userAgent)?.[1];
    assert.equal(
      electronVersion,
      expectedElectronVersion,
      `${label} renderer user agent does not report Electron ${expectedElectronVersion}: ${userAgent}`
    );
    assert.equal(electronVersion, processElectronVersion, `${label} renderer and process Electron versions must agree`);
    await prepareEditorLanguage(page, "en");
    const search = page.getByRole("combobox").first();
    await search.waitFor({ state: "visible" });
    await search.fill("final artifact smoke");
    assert.equal(await search.inputValue(), "final artifact smoke");
    await assertPackagedFontLicenses(page, label);

    const closed = new Promise((resolve, reject) => launched.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}, signal ${signal}`));
    }));
    await page.evaluate(() => window.lyricsCardDesktop?.closeWindow());
    await withTimeout(closed, 30_000, `${label} did not exit cleanly`);
    results.push({
      label,
      artifact: path.basename(sourceArtifactPath),
      artifactSha256,
      executable: path.basename(executablePath),
      electronVersion,
      electronVersionEvidence: "process.versions.electron+renderer-user-agent",
      interaction: true,
      fontLicenses: true,
      cleanExit: true
    });
  } catch (error) {
    const windows = application?.windows() ?? [];
    const startup = await application?.evaluate(({ BrowserWindow }) => ({
      trace: globalThis.__lyricsCardStartupTrace?.snapshot(),
      windows: BrowserWindow.getAllWindows().map(window => ({
        url: window.webContents.getURL(), visible: window.isVisible(), destroyed: window.isDestroyed()
      }))
    })).catch(() => undefined);
    await writeFile(path.join(reportDirectory, `${label}-startup.json`), JSON.stringify({ startup, output }, null, 2));
    await windows[0]?.screenshot({ path: path.join(reportDirectory, `${label}-failure.png`), timeout: 5_000 }).catch(() => undefined);
    throw new Error(`${label} final-artifact smoke failed. ${output}`, { cause: error });
  } finally {
    await closeElectronApplication(application, { label: `${label}-final-artifact` });
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
