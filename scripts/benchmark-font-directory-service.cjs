const crypto = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const vm = require("node:vm");
const {
  FontDirectoryService,
  createWindowsFontScanner
} = require("../electron/font-directory-service");
const { normalizeFontOptions } = require("../electron/font-options");

const BASE_COMMIT = "389a63fd14331a1f2b1094a0bc862999af68e17b";
const captureBaseline = process.argv.includes("--capture-baseline");
const positionalArguments = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const baselinePath = path.resolve(
  positionalArguments[0] || path.join("tmp", "font-performance", "v5.9.4-font-baseline-389a63fd.json")
);
const reportPath = path.resolve(
  positionalArguments[1] || path.join("tmp", "font-performance", "v5.9.4-font-cache-report.json")
);
const baselineMetricsPath = path.join(path.dirname(baselinePath), "v5.9.4-font-baseline-metrics-389a63fd.json");
let baseline;

(async () => {
  if (captureBaseline) await captureLegacyBaseline();
  if (!fs.existsSync(baselinePath)) throw new Error(`Baseline list not found: ${baselinePath}`);
  baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

  const warmScanner = createWindowsFontScanner();
  const warmService = new FontDirectoryService({
    scan: warmScanner.scan,
    disposeScan: warmScanner.dispose
  });
  const cold = await measure("cold", warmService, warmScanner, 1, false);
  const hot = await measure("hot", warmService, warmScanner, 3, false);
  warmService.dispose();

  const concurrentScanner = createWindowsFontScanner();
  const concurrentService = new FontDirectoryService({
    scan: concurrentScanner.scan,
    disposeScan: concurrentScanner.dispose
  });
  const concurrent = await measure("concurrent-cold", concurrentService, concurrentScanner, 4, true);
  concurrentService.dispose();

  const report = {
    baselinePath,
    baselineCount: baseline.length,
    baselineHash: digest(baseline),
    scenarios: [cold, hot, concurrent]
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ reportPath, ...report }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function captureLegacyBaseline() {
  const legacy = createLegacyFontLister();
  const cold = await measureLegacy("cold", legacy, 1, false);
  const baselineOptions = cold.results[0];
  const repeated = await measureLegacy("repeated", legacy, 3, false);
  const concurrent = await measureLegacy("concurrent", legacy, 4, true);
  const baselineHash = digest(baselineOptions);

  for (const scenario of [cold, repeated, concurrent]) {
    for (const result of scenario.results) {
      if (digest(result) !== baselineHash || result.length !== baselineOptions.length) {
        throw new Error(`Legacy ${scenario.label} result drifted while capturing the baseline.`);
      }
    }
  }

  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, `${JSON.stringify(baselineOptions, null, 2)}\n`, "utf8");
  fs.writeFileSync(baselineMetricsPath, `${JSON.stringify({
    baseCommit: BASE_COMMIT,
    baselineCount: baselineOptions.length,
    baselineHash,
    scenarios: [cold, repeated, concurrent].map(({ results: _results, ...scenario }) => scenario)
  }, null, 2)}\n`, "utf8");
}

function createLegacyFontLister() {
  const mainSource = execFileSync("git", ["show", `${BASE_COMMIT}:electron/main.js`], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "NUL",
      GIT_CONFIG_SYSTEM: "NUL"
    }
  });
  const functionStart = mainSource.indexOf("async function listWindowsFontOptions()");
  if (functionStart < 0) throw new Error(`Legacy font lister was not found at ${BASE_COMMIT}.`);
  let subprocesses = 0;
  const context = vm.createContext({
    console,
    normalizeFontOptions,
    spawn: (...args) => {
      subprocesses += 1;
      return spawn(...args);
    }
  });
  vm.runInContext(
    `${mainSource.slice(functionStart)}\nthis.__listWindowsFontOptions = listWindowsFontOptions;`,
    context,
    { filename: `${BASE_COMMIT}:electron/main.js` }
  );
  return {
    list: () => context.__listWindowsFontOptions(),
    getSubprocesses: () => subprocesses
  };
}

async function measureLegacy(label, legacy, requestCount, concurrent) {
  const subprocessesBefore = legacy.getSubprocesses();
  const startedAt = performance.now();
  const results = concurrent
    ? await Promise.all(Array.from({ length: requestCount }, () => legacy.list()))
    : await requestLegacySequentially(legacy, requestCount);
  const elapsedMs = Number((performance.now() - startedAt).toFixed(3));
  return {
    label,
    requests: requestCount,
    subprocesses: legacy.getSubprocesses() - subprocessesBefore,
    elapsedMs,
    averageRequestMs: Number((elapsedMs / requestCount).toFixed(3)),
    results
  };
}

async function requestLegacySequentially(legacy, requestCount) {
  const results = [];
  for (let index = 0; index < requestCount; index += 1) results.push(await legacy.list());
  return results;
}

async function measure(label, service, scanner, requestCount, concurrent) {
  const subprocessesBefore = scanner.getDiagnostics().subprocesses;
  const startedAt = performance.now();
  const results = concurrent
    ? await Promise.all(Array.from({ length: requestCount }, () => service.list()))
    : await requestSequentially(service, requestCount);
  const elapsedMs = Number((performance.now() - startedAt).toFixed(3));

  for (let requestIndex = 0; requestIndex < results.length; requestIndex += 1) {
    assertExactBaseline(results[requestIndex], requestIndex);
  }
  const serviceDiagnostics = service.getDiagnostics();

  return {
    label,
    requests: requestCount,
    subprocesses: scanner.getDiagnostics().subprocesses - subprocessesBefore,
    elapsedMs,
    averageRequestMs: Number((elapsedMs / requestCount).toFixed(3)),
    resultCount: results[0]?.length || 0,
    resultHash: digest(results[0] || []),
    exactBaselineMatches: results.length,
    watcherCount: serviceDiagnostics.watcherCount,
    conservativeRefreshScheduled: serviceDiagnostics.hasRefreshTimer,
    refreshDelayMs: serviceDiagnostics.refreshDelayMs
  };
}

async function requestSequentially(service, requestCount) {
  const results = [];
  for (let index = 0; index < requestCount; index += 1) {
    results.push(await service.list());
  }
  return results;
}

function assertExactBaseline(actual, requestIndex) {
  if (!Array.isArray(actual) || actual.length !== baseline.length) {
    throw new Error(`Request ${requestIndex} returned ${actual?.length ?? "non-array"} fonts; expected ${baseline.length}.`);
  }
  for (let index = 0; index < baseline.length; index += 1) {
    const expectedValue = JSON.stringify(baseline[index]);
    const actualValue = JSON.stringify(actual[index]);
    if (actualValue !== expectedValue) {
      throw new Error(`Request ${requestIndex} differs from baseline at index ${index}: expected ${expectedValue}, received ${actualValue}.`);
    }
  }
}

function digest(options) {
  return crypto.createHash("sha256").update(JSON.stringify(options)).digest("hex");
}
