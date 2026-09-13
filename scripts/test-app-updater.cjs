const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { CancellationToken } = require("builder-util-runtime");
const { createAppUpdater, RELEASES_URL, stableVersion, isNewer } = require("../electron/app-updater");

const version = "6.3.2";
const info = () => ({ version, files: [{ url: `Lyrics.Card.Generator.Setup.${version}.exe`, sha512: Buffer.alloc(64).toString("base64"), size: 100 }] });
function fixture(overrides = {}) {
  const events = [];
  const calls = [];
  const candidate = new EventEmitter();
  candidate.setFeedURL = (value) => { candidate.feed = value; };
  candidate.checkForUpdates = async () => ({ updateInfo: info() });
  candidate.downloadUpdate = async () => { calls.push("download"); candidate.emit("download-progress", { percent: 67.2 }); };
  candidate.quitAndInstall = (...args) => { calls.push(["install", ...args]); };
  const options = {
    currentVersion: "6.3.1", supported: true,
    resolveReleaseUrl: async (url) => {
      assert.equal(url, `${RELEASES_URL}/latest`);
      return `${RELEASES_URL}/tag/v${version}`;
    },
    createUpdater: () => candidate,
    createCancellationToken: () => new CancellationToken(),
    confirm: async () => { calls.push("confirm"); return true; },
    emit: (state) => events.push(state),
    requestClose: () => { calls.push("flush-request"); return true; },
    ...overrides
  };
  const service = createAppUpdater(options);
  return { service, candidate, events, calls };
}

async function main() {
  assert.equal(stableVersion("v6.3.2"), version);
  for (const value of ["v6.3.2-rc.1", "../6.3.2", "6.03.2", "6.3.2/foo", "6.3.9007199254740992"]) assert.equal(stableVersion(value), null);
  assert.equal(isNewer("6.10.0", "6.9.9"), true);
  assert.equal(isNewer("6.3.1", "6.3.1"), false);
  assert.equal(isNewer("6.3.1", "6.3.1-rc.1"), true);
  assert.equal(isNewer("6.3.0", "6.3.1"), false);

  const flow = fixture();
  assert.equal((await flow.service.download()).phase, "idle", "no download without a checked candidate");
  assert.equal(flow.service.installAfterFlush(), false);
  assert.equal((await flow.service.check()).phase, "available");
  assert.equal(flow.candidate.feed.url, `${RELEASES_URL}/download/v${version}/`);
  assert.equal(flow.candidate.autoDownload, false);
  assert.equal(flow.candidate.autoInstallOnAppQuit, false);
  assert.equal(flow.candidate.allowDowngrade, false);
  assert.equal(flow.candidate.disableDifferentialDownload, true);
  assert.deepEqual(flow.calls, [], "checking never asks for consent or downloads");
  assert.equal((await flow.service.download()).phase, "downloaded");
  assert.deepEqual(flow.calls, ["confirm", "download", "flush-request"]);
  assert.ok(flow.events.some((state) => state.phase === "downloading" && state.percent === 67));
  flow.service.closeFailed();
  assert.equal(flow.service.getState().error, "save");
  assert.equal(flow.service.installAfterFlush(), false, "failed save revokes pending installation even on later ordinary close");
  flow.service.requestInstall();
  assert.equal(flow.service.installAfterFlush(), true);
  assert.deepEqual(flow.calls.at(-1), ["install", true, true]);
  assert.equal(flow.service.installAfterFlush(), false, "install is one-shot");

  const decline = fixture({ confirm: async () => false });
  await decline.service.check();
  assert.equal((await decline.service.download()).phase, "available");
  assert.deepEqual(decline.calls, [], "declining never downloads, closes, or installs");
  for (const currentVersion of ["6.3.2", "6.4.0"]) {
    const latest = fixture({ currentVersion, createUpdater: () => assert.fail("current versions need no update metadata") });
    assert.equal((await latest.service.check()).phase, "latest");
  }
  for (const location of ["https://evil.test/v6.3.2", `${RELEASES_URL}/tag/v6.3.2-rc.1`, `${RELEASES_URL}/tag/v6.3.2?x=y`, `${RELEASES_URL}/tag/garbage`]) {
    const bad = fixture({ resolveReleaseUrl: async () => location });
    assert.equal((await bad.service.check()).error, "metadata");
  }
  for (const mutate of [
    (value) => { value.version = "6.3.1"; },
    (value) => { value.files[0].url = "https://evil.test/setup.exe"; },
    (value) => { value.files[0].url = "../setup.exe"; },
    (value) => { value.files[0].sha512 = "invalid"; },
    (value) => { value.files[0].size = 1024 ** 3; },
    (value) => { value.files.push({ ...value.files[0] }); },
    (value) => { value.packages = { x64: { path: "https://evil.test/package" } }; }
  ]) {
    const bad = fixture();
    bad.candidate.checkForUpdates = async () => { const value = info(); mutate(value); return { updateInfo: value }; };
    assert.equal((await bad.service.check()).error, "metadata");
    await bad.service.download();
    assert.deepEqual(bad.calls, []);
  }
  const hashFailure = fixture();
  hashFailure.candidate.downloadUpdate = async () => { throw new Error("sha512 checksum mismatch"); };
  await hashFailure.service.check();
  assert.equal((await hashFailure.service.download()).error, "integrity");
  assert.deepEqual(hashFailure.calls, ["confirm"]);
  assert.equal(hashFailure.service.installAfterFlush(), false);

  const installFailure = fixture();
  installFailure.candidate.quitAndInstall = () => installFailure.candidate.emit("error", new Error("spawn failed"));
  await installFailure.service.check();
  await installFailure.service.download();
  assert.throws(() => installFailure.service.installAfterFlush(), /could not start/);
  assert.equal(installFailure.service.getState().phase, "downloaded");
  assert.equal(installFailure.service.getState().error, "installError");

  const cancel = fixture();
  let entered;
  const downloading = new Promise((resolve) => { entered = resolve; });
  cancel.candidate.downloadUpdate = (token) => new Promise((_, reject) => {
    entered(); token.onCancel(() => reject(new Error("cancelled")));
  });
  await cancel.service.check();
  const pending = cancel.service.download();
  await downloading;
  assert.equal((await cancel.service.check()).phase, "downloading", "checks cannot replace an active candidate");
  await cancel.service.download();
  cancel.service.cancel();
  assert.equal((await pending).phase, "available");
  assert.equal(cancel.service.getState().error, undefined);
  assert.deepEqual(cancel.calls, ["confirm"], "cancellation never reaches installer");

  assert.equal((await fixture({ supported: false }).service.check()).error, "unsupported");
  assert.equal((await fixture({ resolveReleaseUrl: async () => { throw new Error("Release HTTP 403"); } }).service.check()).error, "network");
  assert.equal((await fixture({ resolveReleaseUrl: async () => { throw new DOMException("timeout", "TimeoutError"); } }).service.check()).error, "timeout");
  console.log("Updater regression tests passed: consent, versions, trusted metadata, checksum failure, cancellation, concurrency, and save-before-install.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
