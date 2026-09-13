const RELEASES_URL = "https://github.com/Qrzzzz/lyrics-card-generator/releases";
const CHECK_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;

/** @param {string} value */
function stableVersion(value) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  return match && match.slice(1).every((part) => Number.isSafeInteger(Number(part)))
    ? match.slice(1).join(".") : null;
}

/** @param {string} latest @param {string} current */
function isNewer(latest, current) {
  const base = stableVersion(current.split("-")[0]);
  if (!base) throw new Error("invalid_version");
  const left = latest.split(".").map(Number);
  const right = base.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return current.includes("-");
}

/**
 * Keep URLs and installer paths in main. The renderer can only check, consent,
 * cancel, or request installation of the already verified current candidate.
 * @param {{currentVersion: string, supported: boolean, resolveReleaseUrl: (url: string) => Promise<string>,
 * createUpdater: () => import('electron-updater').NsisUpdater,
 * createCancellationToken: () => import('builder-util-runtime').CancellationToken,
 * confirm: (version: string) => Promise<boolean>,
 * emit: (state: import('../lib/desktop-update').DesktopUpdateState) => void,
 * requestClose: () => boolean}} options
 */
function createAppUpdater(options) {
  /** @type {import('../lib/desktop-update').DesktopUpdateState} */
  let state = { phase: "idle", currentVersion: options.currentVersion };
  /** @type {import('electron-updater').NsisUpdater | null} */
  let updater = null;
  /** @type {import('builder-util-runtime').CancellationToken | null} */
  let downloadToken = null;
  let busy = false;
  let installRequested = false;
  let checkGeneration = 0;

  function getState() { return { ...state }; }

  /** @param {Partial<import('../lib/desktop-update').DesktopUpdateState>} next */
  function publish(next) {
    state = { ...state, error: undefined, percent: undefined, ...next };
    options.emit({ ...state });
    return { ...state };
  }

  /** @param {unknown} error */
  function errorCode(error) {
    const code = /** @type {{code?: string, message?: string, name?: string}} */ (error);
    if (code?.name === "TimeoutError" || /timed? ?out|ETIMEDOUT/i.test(code?.message ?? "")) return "timeout";
    if (/sha512|checksum|signature/i.test(`${code?.code} ${code?.message}`)) return "integrity";
    if (/metadata|version|configuration|404/i.test(code?.message ?? "")) return "metadata";
    return "network";
  }

  async function check() {
    if (busy || ["downloaded", "installing"].includes(state.phase)) return { ...state };
    if (!options.supported) return publish({ phase: "error", error: "unsupported" });
    busy = true;
    const generation = ++checkGeneration;
    updater = null;
    publish({ phase: "checking", latestVersion: undefined });
    try {
      // The public stable-release redirect has no anonymous REST API quota.
      // Chromium fetch also honors Windows' system proxy/PAC configuration.
      const location = new URL(await options.resolveReleaseUrl(`${RELEASES_URL}/latest`));
      if (location.origin !== "https://github.com" || location.username || location.password || location.search || location.hash ||
          !location.pathname.startsWith("/Qrzzzz/lyrics-card-generator/releases/tag/")) throw new Error("invalid_version");
      const tag = location.pathname.slice("/Qrzzzz/lyrics-card-generator/releases/tag/".length);
      const version = stableVersion(tag);
      if (!version) throw new Error("invalid_version");
      if (!isNewer(version, options.currentVersion)) return publish({ phase: "latest", latestVersion: version });

      const candidate = options.createUpdater();
      candidate.autoDownload = false;
      candidate.autoInstallOnAppQuit = false;
      candidate.allowPrerelease = false;
      candidate.allowDowngrade = false;
      candidate.disableDifferentialDownload = true;
      candidate.disableWebInstaller = true;
      candidate.setFeedURL({ provider: "generic", url: `${RELEASES_URL}/download/${tag}/`, useMultipleRangeRequest: false });
      // Error events are always consumed, but the operation's rejection owns UI state.
      candidate.on("error", () => {
        if (updater === candidate && state.phase === "installing") {
          publish({ phase: "downloaded", error: "installError" });
        }
      });
      let timer;
      const result = await Promise.race([
        candidate.checkForUpdates(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("metadata timed out")), CHECK_TIMEOUT_MS); })
      ]).finally(() => clearTimeout(timer));
      const info = /** @type {import('electron-updater').UpdateCheckResult | null} */ (result)?.updateInfo;
      const expectedName = `Lyrics.Card.Generator.Setup.${version}.exe`;
      // Bind metadata to the exact stable release and sole Windows installer.
      if (info?.version !== version || info.files?.length !== 1 || info.files[0].url !== expectedName ||
          !/^[A-Za-z0-9+/]{86}==$/.test(info.files[0].sha512 ?? "") ||
          !Number.isSafeInteger(info.files[0].size) || info.files[0].size <= 0 || info.files[0].size > 512 * 1024 * 1024 ||
          ("packages" in info && info.packages)) throw new Error("invalid_metadata");
      if (generation !== checkGeneration) return { ...state };
      updater = candidate;
      return publish({ phase: "available", latestVersion: version });
    } catch (error) {
      return publish({ phase: "error", error: errorCode(error) });
    } finally {
      busy = false;
    }
  }

  async function download() {
    if (busy || state.phase !== "available" || !updater) return { ...state };
    busy = true;
    const candidate = updater;
    try {
      // Consent is enforced here, at the privileged operation boundary.
      if (!await options.confirm(state.latestVersion)) return { ...state };
      downloadToken = options.createCancellationToken();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; downloadToken?.cancel(); }, DOWNLOAD_TIMEOUT_MS);
      const progress = (/** @type {{percent: number}} */ value) => publish({ phase: "downloading", percent: Math.max(0, Math.min(100, Math.floor(value.percent))) });
      candidate.on("download-progress", progress);
      publish({ phase: "downloading", percent: 0 });
      try {
        await candidate.downloadUpdate(downloadToken);
        if (downloadToken.cancelled) return publish({ phase: "available", error: timedOut ? "timeout" : undefined });
        publish({ phase: "downloaded" });
      } catch (error) {
        return publish({ phase: "available", error: timedOut ? "timeout" : downloadToken.cancelled ? undefined : errorCode(error) });
      } finally {
        clearTimeout(timer);
        candidate.removeListener("download-progress", progress);
        downloadToken = null;
      }
    } catch (error) {
      return publish({ phase: "available", error: errorCode(error) });
    } finally {
      busy = false;
    }
    return requestInstall();
  }

  function cancel() {
    downloadToken?.cancel();
    return { ...state };
  }

  function requestInstall() {
    if (state.phase !== "downloaded" || !updater || busy) return { ...state };
    installRequested = true;
    // Renderer flushes its draft/settings, then confirms close through existing IPC.
    if (!options.requestClose()) installRequested = false;
    return { ...state };
  }

  function installAfterFlush() {
    if (!installRequested || state.phase !== "downloaded" || !updater) return false;
    installRequested = false;
    publish({ phase: "installing" });
    try {
      updater.quitAndInstall(true, true);
      if (getState().phase !== "installing") throw new Error("Update installer could not start");
    } catch (error) {
      publish({ phase: "downloaded", error: "installError" });
      throw error;
    }
    return true;
  }

  function closeFailed() {
    installRequested = false;
    if (state.phase === "downloaded") publish({ phase: "downloaded", error: "save" });
  }

  return { check, download, cancel, requestInstall, installAfterFlush, closeFailed, getState };
}

module.exports = { createAppUpdater, stableVersion, isNewer, RELEASES_URL };
