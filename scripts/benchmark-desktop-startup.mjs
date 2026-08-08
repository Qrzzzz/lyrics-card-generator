import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArguments(process.argv.slice(2));
const executablePath = path.resolve(
  options.executable ?? path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe")
);
const serverEntry = path.join(path.dirname(executablePath), "resources", "server", "server.js");
const reportPath = path.resolve(
  options.report ?? path.join(root, "playwright-report", "desktop", "startup-performance.json")
);

if (process.platform !== "win32") {
  throw new Error("The packaged desktop startup benchmark requires Windows.");
}

await Promise.all([stat(executablePath), stat(serverEntry)]);
const profilesRoot = await mkdtemp(path.join(tmpdir(), "lyrics-card-startup-benchmark-"));
const samples = [];

try {
  for (let index = 0; index < options.coldSamples; index += 1) {
    const profile = path.join(profilesRoot, `cold-${index + 1}`);
    await seedProfile(profile);
    samples.push(await runSample({ kind: "cold", index: index + 1, profile }));
  }

  const hotProfile = path.join(profilesRoot, "hot");
  await seedProfile(hotProfile);
  await runSample({ kind: "warmup", index: 0, profile: hotProfile });
  for (let index = 0; index < options.hotSamples; index += 1) {
    samples.push(await runSample({ kind: "hot", index: index + 1, profile: hotProfile }));
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    label: options.label,
    executablePath,
    executableSha256: await hashFile(executablePath),
    coldDefinition: "fresh Electron userData profile with seeded preferences and an empty Chromium HTTP cache",
    hotDefinition: "repeated clean launches using one warmed Electron userData profile",
    sampleCounts: { cold: options.coldSamples, hot: options.hotSamples },
    summary: summarize(samples),
    packagedAssets: await collectPackagedAssetEvidence(),
    samples
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ reportPath, summary: report.summary }, null, 2)}\n`);
} finally {
  await rm(profilesRoot, { recursive: true, force: true }).catch(() => undefined);
}

async function runSample({ kind, index, profile }) {
  const startedEpochMs = Date.now();
  const startedAt = performance.now();
  const elapsed = () => round(performance.now() - startedAt);
  const outputEvents = [];
  let electronApp;
  let page;
  let mainPid;
  let serverProcesses = [];

  process.stdout.write(`[startup-benchmark] ${kind} ${index || "warmup"} launching\n`);
  try {
    const launchEnvironment = {
      ...process.env,
      LYRICS_CARD_STARTUP_TRACE: "1",
      LYRICS_CARD_TEST_USER_DATA: profile
    };
    delete launchEnvironment.ELECTRON_RUN_AS_NODE;

    electronApp = await electron.launch({
      executablePath,
      env: launchEnvironment,
      timeout: 90_000
    });
    const launchState = await electronApp.evaluate(({ app }) => ({
      appReady: app.isReady(),
      ownsSingleInstanceLock: app.hasSingleInstanceLock(),
      pid: process.pid
    }));
    const mainProcessConnectedMs = elapsed();
    const childProcess = electronApp.process();
    mainPid = launchState.pid;
    for (const [streamName, stream] of [["stdout", childProcess.stdout], ["stderr", childProcess.stderr]]) {
      stream?.on("data", (chunk) => {
        outputEvents.push({ atMs: elapsed(), stream: streamName, text: chunk.toString().slice(0, 4_000) });
      });
    }

    page = await electronApp.firstWindow({ timeout: 90_000 });
    const windowCreatedMs = elapsed();
    await page.waitForLoadState("domcontentloaded", { timeout: 60_000 });
    const domObservedMs = elapsed();
    await page.locator('[data-testid="editor-surface"]').waitFor({ state: "visible", timeout: 60_000 });
    const editorVisibleMs = elapsed();
    const windowVisibleMs = await waitForWindowVisible(electronApp, elapsed);
    await page.evaluate(() => document.fonts.ready);
    const fontsReadyMs = elapsed();

    const firstScreen = await collectRendererMetrics(page);
    const representativeHeaders = await collectRepresentativeHeaders(page.url(), firstScreen.resources);

    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-surface").waitFor({ state: "visible", timeout: 30_000 });
    const firstInteractionMs = elapsed();
    await page.getByTestId("settings-close-button").click();

    const mainState = await electronApp.evaluate(({ app, BrowserWindow }) => ({
      appReady: app.isReady(),
      ownsSingleInstanceLock: app.hasSingleInstanceLock(),
      pid: process.pid,
      processUptimeMs: Math.round(process.uptime() * 1_000),
      windowCount: BrowserWindow.getAllWindows().length,
      visibleWindowCount: BrowserWindow.getAllWindows().filter((window) => window.isVisible()).length
    }));
    const startupTrace = await electronApp.evaluate(() => globalThis.__lyricsCardStartupTrace?.snapshot() ?? null);
    const startupTraceMs = Object.fromEntries(
      (startupTrace?.marks ?? []).map((mark) => [mark.name, mark.atMs])
    );
    assert.equal(mainState.ownsSingleInstanceLock, true);
    assert.equal(mainState.windowCount, 1);
    serverProcesses = await waitForBundledServer(mainPid);
    assert.equal(serverProcesses.length, 1, "each primary launch must own exactly one bundled Next process");

    const result = {
      kind,
      index,
      origin: new URL(page.url()).origin,
      milestonesMs: {
        processLaunch: 0,
        mainProcessConnected: mainProcessConnectedMs,
        singleInstanceOwnershipObserved: mainProcessConnectedMs,
        appReadyObserved: mainProcessConnectedMs,
        nextProcessCreated: creationOffsetMs(serverProcesses[0]?.creationTimeUtc, startedEpochMs),
        authenticatedHttpReadyUpperBound: windowCreatedMs,
        windowCreated: windowCreatedMs,
        domContentLoadedObserved: domObservedMs,
        editorVisible: editorVisibleMs,
        nativeWindowVisible: windowVisibleMs,
        fontsReady: fontsReadyMs,
        firstInteractionCompleted: firstInteractionMs
      },
      mainState,
      startupTrace,
      startupTraceMs,
      nextProcesses: serverProcesses,
      outputEvents,
      nextReadyLogObservedMs: firstMatchingOutputTime(outputEvents, /\bReady in\b/i),
      firstScreen,
      representativeHeaders
    };

    await page.evaluate(() => window.lyricsCardDesktopBridge?.confirmWindowClose()).catch(() => undefined);
    await closeElectronApplication(electronApp, { label: `startup-benchmark-${kind}-${index}` });
    electronApp = undefined;
    result.cleanShutdownMs = elapsed();
    result.residualNextProcessCount = (await waitForNoBundledServer()).length;
    assert.equal(result.residualNextProcessCount, 0, "clean shutdown must leave no bundled Next process");
    process.stdout.write(`[startup-benchmark] ${kind} ${index || "warmup"} complete (${result.cleanShutdownMs}ms)\n`);
    return result;
  } catch (error) {
    const tail = outputEvents.slice(-10);
    throw new Error(
      `${kind} startup sample ${index} failed: ${error instanceof Error ? error.stack || error.message : String(error)}; output=${JSON.stringify(tail)}`
    );
  } finally {
    await page?.evaluate(() => window.lyricsCardDesktopBridge?.confirmWindowClose()).catch(() => undefined);
    await closeElectronApplication(electronApp, { label: `startup-benchmark-${kind}-${index}-cleanup` });
  }
}

async function collectRendererMetrics(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTime: Math.round(entry.startTime * 10) / 10,
      responseEnd: Math.round(entry.responseEnd * 10) / 10,
      duration: Math.round(entry.duration * 10) / 10,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      deliveryType: entry.deliveryType ?? ""
    }));
    const entries = navigation ? [{
      name: navigation.name,
      initiatorType: "navigation",
      transferSize: navigation.transferSize,
      encodedBodySize: navigation.encodedBodySize,
      decodedBodySize: navigation.decodedBodySize
    }, ...resources] : resources;
    const summaryFor = (predicate) => {
      const selected = entries.filter(predicate);
      return {
        count: selected.length,
        transferBytes: selected.reduce((sum, entry) => sum + entry.transferSize, 0),
        encodedBytes: selected.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        decodedBytes: selected.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
        cacheHits: selected.filter((entry) => entry.transferSize === 0 && entry.encodedBodySize > 0).length
      };
    };
    const fontFaces = [];
    document.fonts.forEach((font) => fontFaces.push({ family: font.family, status: font.status, weight: font.weight }));
    return {
      navigation: navigation ? {
        domInteractive: Math.round(navigation.domInteractive * 10) / 10,
        domContentLoadedEventEnd: Math.round(navigation.domContentLoadedEventEnd * 10) / 10,
        loadEventEnd: Math.round(navigation.loadEventEnd * 10) / 10,
        responseStart: Math.round(navigation.responseStart * 10) / 10,
        responseEnd: Math.round(navigation.responseEnd * 10) / 10,
        transferSize: navigation.transferSize,
        encodedBodySize: navigation.encodedBodySize,
        decodedBodySize: navigation.decodedBodySize
      } : null,
      totals: summaryFor(() => true),
      nextStatic: summaryFor((entry) => entry.name.includes("/_next/static/")),
      fonts: summaryFor((entry) => entry.name.includes("/fonts/")),
      appIcon: summaryFor((entry) => entry.name.includes("/app-icon.png")),
      platformIcons: summaryFor((entry) => entry.name.includes("/platform-icons/")),
      fontFaces,
      resources
    };
  });
}

async function collectRepresentativeHeaders(pageUrl, resources) {
  const selectors = {
    document: pageUrl,
    nextStatic: resources.find((entry) => entry.name.includes("/_next/static/"))?.name,
    css: resources.find((entry) => entry.name.includes("/_next/static/css/"))?.name,
    font: resources.find((entry) => entry.name.includes("/fonts/"))?.name,
    appIcon: resources.find((entry) => entry.name.includes("/app-icon.png"))?.name
  };
  const results = {};
  for (const [label, url] of Object.entries(selectors)) {
    if (!url) continue;
    results[label] = await readHead(url);
  }
  return results;
}

function readHead(value) {
  const url = new URL(value);
  return new Promise((resolve, reject) => {
    const request = http.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: Number(url.port),
      path: `${url.pathname}${url.search}`,
      method: "HEAD",
      agent: false,
      headers: { Connection: "close" }
    }, (response) => {
      response.resume();
      resolve({
        url: value,
        status: response.statusCode,
        cacheControl: String(response.headers["cache-control"] ?? ""),
        contentLength: Number(response.headers["content-length"] ?? 0),
        contentType: String(response.headers["content-type"] ?? ""),
        etag: String(response.headers.etag ?? "")
      });
    });
    request.once("error", reject);
    request.setTimeout(10_000, () => request.destroy(new Error(`HEAD timed out for ${value}`)));
    request.end();
  });
}

async function waitForWindowVisible(electronApp, elapsed, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const visible = await electronApp.evaluate(({ BrowserWindow }) => (
      BrowserWindow.getAllWindows().some((window) => window.isVisible())
    ));
    if (visible) return elapsed();
    await delay(10);
  }
  throw new Error("The native window did not become visible.");
}

async function waitForBundledServer(parentPid, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let processes = [];
  while (Date.now() < deadline) {
    processes = await listBundledServers();
    if (processes.length === 1 && processes[0].parentProcessId === parentPid) return processes;
    await delay(100);
  }
  throw new Error(`Expected one bundled server owned by ${parentPid}; observed=${JSON.stringify(processes)}`);
}

async function waitForNoBundledServer(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let processes = [];
  while (Date.now() < deadline) {
    processes = await listBundledServers();
    if (processes.length === 0) return processes;
    await delay(100);
  }
  return processes;
}

async function listBundledServers() {
  const target = serverEntry.replaceAll("'", "''");
  const script = [
    `$target = '${target}'`,
    "$items = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.IndexOf($target, [StringComparison]::OrdinalIgnoreCase) -ge 0 } | ForEach-Object { [pscustomobject]@{ processId = [int]$_.ProcessId; parentProcessId = [int]$_.ParentProcessId; creationTimeUtc = $_.CreationDate.ToUniversalTime().ToString('o'); commandLine = [string]$_.CommandLine } })",
    "ConvertTo-Json -InputObject @($items) -Compress"
  ].join("; ");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  const parsed = JSON.parse(stdout.trim() || "[]");
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function seedProfile(profile) {
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, "app-preferences.json"), `${JSON.stringify({
    schemaVersion: 2,
    revision: 1,
    updatedAt: 1,
    locale: "zh",
    userSettings: { firstLaunchLanguageSelected: true }
  }, null, 2)}\n`, "utf8");
}

function summarize(samples) {
  const summary = {};
  for (const kind of ["cold", "hot"]) {
    const selected = samples.filter((sample) => sample.kind === kind);
    summary[kind] = {
      origins: [...new Set(selected.map((sample) => sample.origin))],
      originReuseCount: selected.length - new Set(selected.map((sample) => sample.origin)).size,
      milestonesMs: summarizeObject(selected.map((sample) => sample.milestonesMs)),
      startupTraceMs: summarizeObject(selected.map((sample) => sample.startupTraceMs)),
      firstScreen: {
        requestCount: summarizeNumbers(selected.map((sample) => sample.firstScreen.totals.count)),
        transferBytes: summarizeNumbers(selected.map((sample) => sample.firstScreen.totals.transferBytes)),
        cacheHits: summarizeNumbers(selected.map((sample) => sample.firstScreen.totals.cacheHits)),
        nextStaticTransferBytes: summarizeNumbers(selected.map((sample) => sample.firstScreen.nextStatic.transferBytes)),
        fontTransferBytes: summarizeNumbers(selected.map((sample) => sample.firstScreen.fonts.transferBytes)),
        appIconTransferBytes: summarizeNumbers(selected.map((sample) => sample.firstScreen.appIcon.transferBytes))
      },
      nextProcessCount: summarizeNumbers(selected.map((sample) => sample.nextProcesses.length)),
      residualNextProcessCount: summarizeNumbers(selected.map((sample) => sample.residualNextProcessCount))
    };
  }
  return summary;
}

function summarizeObject(objects) {
  const result = {};
  for (const key of Object.keys(objects[0] ?? {})) {
    const values = objects.map((object) => object[key]).filter(Number.isFinite);
    if (values.length) result[key] = summarizeNumbers(values);
  }
  return result;
}

function summarizeNumbers(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { median: round(median), min: round(sorted[0]), max: round(sorted.at(-1)) };
}

async function collectPackagedAssetEvidence() {
  const serverRoot = path.join(path.dirname(executablePath), "resources", "server");
  const paths = [
    "public/app-icon.png",
    "public/fonts/SourceHanSansSC-Heavy.otf",
    "public/fonts/SourceHanSerifSC-Heavy.otf"
  ];
  const assets = {};
  for (const relativePath of paths) {
    const filePath = path.join(serverRoot, ...relativePath.split("/"));
    assets[relativePath] = { bytes: (await stat(filePath)).size, sha256: await hashFile(filePath) };
  }
  const staticFiles = await listFiles(path.join(serverRoot, ".next", "static"));
  const staticManifestLines = [];
  let staticBytes = 0;
  for (const filePath of staticFiles) {
    const info = await stat(filePath);
    const relativePath = path.relative(serverRoot, filePath).replaceAll(path.sep, "/");
    staticBytes += info.size;
    staticManifestLines.push(`${relativePath}\t${info.size}\t${await hashFile(filePath)}`);
  }
  return {
    assets,
    nextStatic: {
      files: staticFiles.length,
      bytes: staticBytes,
      manifestSha256: crypto.createHash("sha256").update(staticManifestLines.sort().join("\n")).digest("hex")
    }
  };
}

async function listFiles(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await listFiles(target));
    else if (entry.isFile()) results.push(target);
  }
  return results;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });
}

function creationOffsetMs(creationTimeUtc, startedEpochMs) {
  const value = Date.parse(creationTimeUtc ?? "");
  return Number.isFinite(value) ? Math.max(0, value - startedEpochMs) : null;
}

function firstMatchingOutputTime(events, pattern) {
  return events.find((event) => pattern.test(event.text))?.atMs ?? null;
}

function parseArguments(argumentsList) {
  const values = {};
  for (const argument of argumentsList) {
    const match = /^--([^=]+)=(.*)$/.exec(argument);
    if (match) values[match[1]] = match[2];
  }
  const positiveInteger = (name, fallback) => {
    const parsed = Number(values[name] ?? fallback);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 20) {
      throw new Error(`--${name} must be an integer between 1 and 20.`);
    }
    return parsed;
  };
  return {
    coldSamples: positiveInteger("cold", 3),
    hotSamples: positiveInteger("hot", 3),
    executable: values.executable,
    label: values.label ?? "",
    report: values.report
  };
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
