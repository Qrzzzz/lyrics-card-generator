const { spawn } = require("node:child_process");
const { existsSync, watch: watchDirectory } = require("node:fs");
const path = require("node:path");
const { normalizeFontOptions } = require("./font-options");

const DEFAULT_SCAN_TIMEOUT_MS = 30_000;
const DEFAULT_REFRESH_INTERVAL_MS = 30_000;
const DEFAULT_REGISTRY_REFRESH_INTERVAL_MS = 5 * 60_000;
const FONT_SCAN_CANCELLED = "font_scan_cancelled";
const FONT_SCAN_TIMEOUT = "font_scan_timeout";
const defaultFontSourceWatcher = createFontSourceWatcher();
const FALLBACK_FONT_OPTIONS = normalizeFontOptions([
  "Arial",
  "Calibri",
  "Microsoft YaHei",
  "Microsoft JhengHei",
  "Segoe UI",
  "SimSun",
  "SimHei"
]);

class FontDirectoryService {
  constructor({
    scan,
    disposeScan = () => {},
    fallbackOptions = FALLBACK_FONT_OPTIONS,
    watch = defaultFontSourceWatcher,
    refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
    registryRefreshIntervalMs = DEFAULT_REGISTRY_REFRESH_INTERVAL_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    onError = /** @type {(error: unknown) => void} */ (() => {})
  }) {
    if (typeof scan !== "function") throw new TypeError("FontDirectoryService requires a scan function.");
    this.scan = scan;
    this.disposeScan = disposeScan;
    this.fallbackOptions = freezeFontOptions(normalizeFontOptions(fallbackOptions));
    this.watch = watch;
    this.refreshIntervalMs = refreshIntervalMs;
    this.registryRefreshIntervalMs = registryRefreshIntervalMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onError = onError;
    this.cachedResult = null;
    this.inFlight = null;
    this.dirty = true;
    this.disposed = false;
    this.generation = 0;
    this.refreshTimer = null;
    this.refreshDelayMs = null;
    this.watchers = new Map();
    this.diagnostics = {
      requests: 0,
      cacheHits: 0,
      scanStarts: 0,
      coalescedRequests: 0,
      failures: 0,
      invalidations: 0
    };
  }

  list() {
    this.diagnostics.requests += 1;
    if (this.disposed) return Promise.reject(createFontScanError(FONT_SCAN_CANCELLED, "Font directory service is disposed."));
    if (this.cachedResult && !this.dirty) {
      this.diagnostics.cacheHits += 1;
      return Promise.resolve(this.cachedResult.options);
    }
    if (this.inFlight) {
      this.diagnostics.coalescedRequests += 1;
      return this.inFlight;
    }

    const scanGeneration = this.generation;
    this.diagnostics.scanStarts += 1;
    const work = Promise.resolve()
      .then(() => this.scan())
      .then((scanResult) => {
        if (this.disposed) throw createFontScanError(FONT_SCAN_CANCELLED, "Font scan was cancelled during shutdown.");
        const normalizedResult = normalizeScanResult(scanResult);
        const options = freezeFontOptions(normalizeFontOptions(normalizedResult.options));

        // A directory event during enumeration makes this snapshot usable for the
        // current batch, but never clean enough to satisfy the next request.
        if (scanGeneration === this.generation) {
          this.cachedResult = { options, sourceDirectories: normalizedResult.sourceDirectories };
          this.dirty = false;
          const watcherCoverageComplete = this.configureWatchers(normalizedResult.sourceDirectories);
          this.scheduleConservativeRefresh(watcherCoverageComplete);
        }
        return options;
      })
      .catch((error) => {
        if (isFontScanCancellation(error) || this.disposed) {
          throw isFontScanCancellation(error)
            ? error
            : createFontScanError(FONT_SCAN_CANCELLED, "Font scan was cancelled during shutdown.", error);
        }
        this.diagnostics.failures += 1;
        this.onError(error);
        // Preserve the legacy fallback behavior without treating fallback or a
        // stale last-known-good snapshot as a successful scan. The dirty flag
        // remains set, so the next request always retries the real source.
        return this.cachedResult?.options || this.fallbackOptions;
      });

    const shared = work.finally(() => {
      if (this.inFlight === shared) this.inFlight = null;
    });
    this.inFlight = shared;
    return shared;
  }

  invalidate() {
    if (this.disposed) return;
    this.generation += 1;
    this.dirty = true;
    this.diagnostics.invalidations += 1;
    this.clearRefreshTimer();
  }

  configureWatchers(sourceDirectories) {
    this.closeWatchers();
    let watcherCoverageComplete = sourceDirectories.length > 0;
    for (const directory of sourceDirectories) {
      try {
        const watcher = this.watch(directory, { persistent: false }, () => this.invalidate());
        this.watchers.set(directory, watcher);
        watcher.on?.("error", () => {
          if (this.watchers.get(directory) !== watcher) return;
          try {
            watcher.close();
          } catch {
            // The watcher may already have closed itself after the error.
          }
          this.watchers.delete(directory);
          this.invalidate();
        });
      } catch {
        // Missing or unsupported sources remain covered by the conservative
        // refresh below, so a failed watcher cannot make the cache permanent.
        watcherCoverageComplete = false;
      }
    }
    return watcherCoverageComplete;
  }

  scheduleConservativeRefresh(watcherCoverageComplete) {
    this.clearRefreshTimer();
    // Directory watchers cannot observe HKLM/HKCU-only registrations, label
    // changes, or removals. Keep the existing 30-second fallback when directory
    // coverage is incomplete, and bound registry-only staleness to five minutes
    // when every directory is watched. The timer only marks the cache dirty;
    // the next real request performs the scan, so an idle app starts no process.
    const refreshDelayMs = watcherCoverageComplete
      ? this.registryRefreshIntervalMs
      : this.refreshIntervalMs;
    if (!Number.isFinite(refreshDelayMs) || refreshDelayMs <= 0) return;
    this.refreshDelayMs = refreshDelayMs;
    this.refreshTimer = this.setTimer(() => {
      this.refreshTimer = null;
      this.refreshDelayMs = null;
      this.invalidate();
    }, refreshDelayMs);
    this.refreshTimer?.unref?.();
  }

  clearRefreshTimer() {
    if (this.refreshTimer === null) return;
    this.clearTimer(this.refreshTimer);
    this.refreshTimer = null;
    this.refreshDelayMs = null;
  }

  closeWatchers() {
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close();
      } catch {
        // Watchers can race with source removal or operating-system shutdown.
      }
    }
    this.watchers.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.dirty = true;
    this.clearRefreshTimer();
    this.closeWatchers();
    this.cachedResult = null;
    this.disposeScan();
  }

  getDiagnostics() {
    return {
      ...this.diagnostics,
      dirty: this.dirty,
      hasCachedResult: Boolean(this.cachedResult),
      hasInFlightScan: Boolean(this.inFlight),
      watcherCount: this.watchers.size,
      hasRefreshTimer: this.refreshTimer !== null,
      refreshDelayMs: this.refreshDelayMs,
      disposed: this.disposed
    };
  }
}

function createWindowsFontDirectoryService(options = {}) {
  const scanner = createWindowsFontScanner(options);
  const service = new FontDirectoryService({
    scan: scanner.scan,
    disposeScan: scanner.dispose,
    fallbackOptions: options.fallbackOptions,
    watch: options.watch,
    refreshIntervalMs: options.refreshIntervalMs,
    registryRefreshIntervalMs: options.registryRefreshIntervalMs,
    setTimer: options.setTimer,
    clearTimer: options.clearTimer,
    onError: options.onError
  });

  return {
    list: () => service.list(),
    invalidate: () => service.invalidate(),
    dispose: () => service.dispose(),
    getDiagnostics: () => ({
      ...service.getDiagnostics(),
      scanner: scanner.getDiagnostics()
    })
  };
}

function createWindowsFontScanner({
  platform = process.platform,
  environment = process.env,
  spawnProcess = spawn,
  scanTimeoutMs = DEFAULT_SCAN_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onSubprocessStart = /** @type {(child: import("node:child_process").ChildProcess) => void} */ (() => {})
} = {}) {
  let disposed = false;
  const activeRuns = new Set();
  const diagnostics = {
    subprocesses: 0,
    successfulScans: 0,
    processFailures: 0,
    timeouts: 0,
    cancellations: 0
  };

  async function scan() {
    if (disposed) throw createFontScanError(FONT_SCAN_CANCELLED, "Font scanner is disposed.");
    if (platform !== "win32") return { options: [], sourceDirectories: [] };
    const output = await runProcess("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      buildWindowsFontDiscoveryScript()
    ]);
    const parsed = JSON.parse(output || "{}");
    const result = normalizeScanResult(parsed);
    result.sourceDirectories = normalizeSourceDirectories([
      ...getDefaultWindowsFontDirectories(environment),
      ...result.sourceDirectories
    ]);
    diagnostics.successfulScans += 1;
    return result;
  }

  function runProcess(command, args) {
    return new Promise((resolve, reject) => {
      if (disposed) {
        reject(createFontScanError(FONT_SCAN_CANCELLED, "Font scanner is disposed."));
        return;
      }

      let child;
      try {
        child = spawnProcess(command, args, {
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true
        });
      } catch (error) {
        diagnostics.processFailures += 1;
        reject(error);
        return;
      }

      diagnostics.subprocesses += 1;
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timeout = null;
      const run = {
        child,
        cancel: () => {
          diagnostics.cancellations += 1;
          settle(createFontScanError(FONT_SCAN_CANCELLED, "Font scan was cancelled during shutdown."), undefined, true);
        }
      };
      activeRuns.add(run);

      const settle = (error, value, terminate = false) => {
        if (settled) return;
        settled = true;
        if (timeout !== null) {
          clearTimer(timeout);
          timeout = null;
        }
        if (terminate) terminateChild(child);
        if (error) reject(error);
        else resolve(value);
      };

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.once("error", (error) => {
        activeRuns.delete(run);
        diagnostics.processFailures += 1;
        settle(error);
      });
      child.once("close", (code) => {
        activeRuns.delete(run);
        if (settled) return;
        if (code === 0) {
          settle(null, stdout.trim());
          return;
        }
        diagnostics.processFailures += 1;
        settle(new Error(stderr.trim() || `${command} exited with code ${code}`));
      });

      if (Number.isFinite(scanTimeoutMs) && scanTimeoutMs > 0) {
        timeout = setTimer(() => {
          diagnostics.timeouts += 1;
          activeRuns.delete(run);
          settle(
            createFontScanError(FONT_SCAN_TIMEOUT, `Font scan exceeded ${scanTimeoutMs} ms.`),
            undefined,
            true
          );
        }, scanTimeoutMs);
        timeout?.unref?.();
      }
      try {
        onSubprocessStart(child);
      } catch (error) {
        activeRuns.delete(run);
        diagnostics.processFailures += 1;
        settle(error, undefined, true);
      }
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const run of [...activeRuns]) {
      activeRuns.delete(run);
      run.cancel();
    }
  }

  return {
    scan,
    dispose,
    getDiagnostics: () => ({ ...diagnostics, activeProcesses: activeRuns.size, disposed })
  };
}

function buildWindowsFontDiscoveryScript() {
  return [
    "$ErrorActionPreference = 'Stop';",
    "[Console]::OutputEncoding = [Text.UTF8Encoding]::new();",
    "Add-Type -AssemblyName System.Drawing;",
    "$paths = @(",
    "  'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',",
    "  'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'",
    ");",
    "$fontOptions = [Collections.Generic.List[object]]::new();",
    "$sourceDirectories = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase);",
    "foreach ($path in $paths) {",
    "  if (Test-Path $path) {",
    "    $item = Get-ItemProperty -Path $path;",
    "    foreach ($property in ($item.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' })) {",
    "      $label = $property.Name -replace '\\s*\\((TrueType|OpenType|Type 1|Raster|All res)\\)\\s*$', '';",
    "      foreach ($fileValue in @($property.Value)) {",
    "        try {",
    "          $fontPath = if ([IO.Path]::IsPathRooted([string]$fileValue)) { [string]$fileValue } else { Join-Path $env:WINDIR ('Fonts\\' + $fileValue) };",
    "          if (-not (Test-Path -LiteralPath $fontPath)) { continue };",
    "          $fontDirectory = [IO.Path]::GetDirectoryName($fontPath);",
    "          if ($fontDirectory) { [void]$sourceDirectories.Add($fontDirectory) };",
    "          $privateFonts = [Drawing.Text.PrivateFontCollection]::new();",
    "          try {",
    "            $privateFonts.AddFontFile($fontPath);",
    "            $weight = if ($label -match '(?i)(Extra|Ultra)[ -]*Light|特细|超细') { 200 } elseif ($label -match '(?i)(Extra|Ultra)[ -]*Bold|特粗|超粗') { 800 } elseif ($label -match '(?i)(Semi|Demi)[ -]*Bold|中粗') { 600 } elseif ($label -match '(?i)\\b(Heavy|Black)\\b') { 900 } elseif ($label -match '(?i)\\bBold\\b|粗体') { 700 } elseif ($label -match '(?i)\\bMedium\\b|中等') { 500 } elseif ($label -match '(?i)\\bLight\\b|细体') { 300 } else { 400 };",
    "            $fontStyle = if ($label -match '(?i)\\b(Italic|Oblique)\\b|斜体|倾斜') { 'italic' } else { 'normal' };",
    "            foreach ($family in $privateFonts.Families) {",
    "              $fontOptions.Add([pscustomobject]@{ label = $label.Trim(); family = $family.GetName(0x0409).Trim(); fontWeight = $weight; fontStyle = $fontStyle });",
    "            }",
    "          } finally { $privateFonts.Dispose() }",
    "        } catch { continue }",
    "      }",
    "    }",
    "  }",
    "}",
    "$installedFonts = [Drawing.Text.InstalledFontCollection]::new();",
    "foreach ($family in $installedFonts.Families) {",
    "  $englishFamily = $family.GetName(0x0409).Trim();",
    "  $fontOptions.Add([pscustomobject]@{ label = $englishFamily; family = $englishFamily; fontWeight = 400; fontStyle = 'normal' });",
    "}",
    "[pscustomobject]@{ options = @($fontOptions); sourceDirectories = @($sourceDirectories) } | ConvertTo-Json -Compress -Depth 4"
  ].join(" ");
}

function normalizeScanResult(value) {
  if (Array.isArray(value)) return { options: value, sourceDirectories: [] };
  return {
    options: Array.isArray(value?.options) ? value.options : value?.options ? [value.options] : [],
    sourceDirectories: normalizeSourceDirectories(value?.sourceDirectories)
  };
}

function normalizeSourceDirectories(values) {
  const uniqueDirectories = new Map();
  for (const value of Array.isArray(values) ? values : values ? [values] : []) {
    if (typeof value !== "string" || !value.trim()) continue;
    const candidate = value.trim();
    const directory = path.win32.isAbsolute(candidate) ? path.win32.normalize(candidate) : path.resolve(candidate);
    uniqueDirectories.set(directory.toLowerCase(), directory);
  }
  return [...uniqueDirectories.values()];
}

function createFontSourceWatcher({ exists = existsSync, watch = watchDirectory } = {}) {
  return (directory, options, onChange) => {
    const pathApi = path.win32.isAbsolute(directory) ? path.win32 : path;
    let watchedDirectory = directory;
    while (!exists(watchedDirectory)) {
      const parentDirectory = pathApi.dirname(watchedDirectory);
      if (parentDirectory === watchedDirectory) {
        /** @type {NodeJS.ErrnoException} */
        const error = new Error(`No watchable parent exists for font source: ${directory}`);
        error.code = "ENOENT";
        throw error;
      }
      watchedDirectory = parentDirectory;
    }

    if (watchedDirectory.toLowerCase() === directory.toLowerCase()) {
      return watch(watchedDirectory, options, onChange);
    }

    const missingPath = pathApi.relative(watchedDirectory, directory);
    const firstMissingSegment = missingPath.split(pathApi.sep).filter(Boolean)[0];
    return watch(watchedDirectory, options, (eventType, filename) => {
      // A filename-less event is ambiguous, so invalidate conservatively. When
      // a name is present, ignore unrelated churn in the watched ancestor.
      if (filename === null || filename === undefined || String(filename).toLowerCase() === firstMissingSegment.toLowerCase()) {
        onChange(eventType, filename);
      }
    });
  };
}

function getDefaultWindowsFontDirectories(environment) {
  const directories = [];
  if (environment.WINDIR) directories.push(path.win32.join(environment.WINDIR, "Fonts"));
  if (environment.LOCALAPPDATA) directories.push(path.win32.join(environment.LOCALAPPDATA, "Microsoft", "Windows", "Fonts"));
  return directories;
}

function freezeFontOptions(options) {
  return Object.freeze(options.map((option) => Object.freeze({ ...option })));
}

function terminateChild(child) {
  try {
    child.kill();
  } catch {
    // The process can exit between timeout/cancellation and termination.
  }
  child.stdout?.destroy?.();
  child.stderr?.destroy?.();
  child.unref?.();
}

function createFontScanError(code, message, cause) {
  /** @type {NodeJS.ErrnoException} */
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function isFontScanCancellation(error) {
  return error?.code === FONT_SCAN_CANCELLED;
}

module.exports = {
  DEFAULT_REGISTRY_REFRESH_INTERVAL_MS,
  DEFAULT_REFRESH_INTERVAL_MS,
  DEFAULT_SCAN_TIMEOUT_MS,
  FALLBACK_FONT_OPTIONS,
  FONT_SCAN_CANCELLED,
  FONT_SCAN_TIMEOUT,
  FontDirectoryService,
  buildWindowsFontDiscoveryScript,
  createFontSourceWatcher,
  createWindowsFontDirectoryService,
  createWindowsFontScanner,
  normalizeScanResult,
  normalizeSourceDirectories
};
