import assert from "node:assert/strict";
import { defaultState } from "../components/editor/editor-defaults";
import { evaluateMinimumExportSafety, type ExportDomSafety } from "../lib/export-safety";
import { exportNodeAsImage, exportNodeAsPng, type ExportImageDependencies } from "../lib/export-image";
import { createExportSnapshot } from "../lib/export-snapshot";
import { ExportTransactionMutex, runExportTransaction, waitForExportSnapshotNode } from "../lib/export-transaction";
import {
  createBlobUrlRetirementState,
  reconcileBlobUrlRetirement
} from "../lib/object-url-lifecycle";
import type { AppState } from "../lib/types";

const readyDom: ExportDomSafety = {
  isCardMounted: true,
  areFontsReady: true,
  isCardSizeStable: true,
  isAutoWidthStable: true,
  isAutoHeightStable: true,
  hasContentOverflow: false
};

{
  const live: AppState = {
    ...defaultState,
    song: { ...defaultState.song, title: "Snapshot Song", artist: "Before" },
    lyrics: "old lyrics",
    style: { ...defaultState.style, width: 1200, height: 1800 }
  };
  const snapshot = createExportSnapshot(live, 2, 42);
  live.song.title = "Mutated Song";
  live.lyrics = "new lyrics";
  live.style.width = 640;
  assert.equal(snapshot.song.title, "Snapshot Song");
  assert.equal(snapshot.lyrics, "old lyrics");
  assert.equal(snapshot.width, 1200);
  assert.equal(snapshot.format, "png");
  assert.equal(snapshot.fileName, "lyric-card-Snapshot-Song.png");
  assert.equal(snapshot.revision, 42);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.song), true);
  assert.equal(Object.isFrozen(snapshot.style), true);

  const webpSnapshot = createExportSnapshot(live, 1.4, 43, "webp");
  const jpgSnapshot = createExportSnapshot(live, 1, 44, "jpg");
  assert.equal(webpSnapshot.format, "webp");
  assert.equal(webpSnapshot.fileName, "lyric-card-Mutated-Song.webp");
  assert.equal(jpgSnapshot.format, "jpg");
  assert.equal(jpgSnapshot.fileName, "lyric-card-Mutated-Song.jpg");
}

{
  const lines = (count: number) => Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");
  const state36 = { ...defaultState, lyrics: lines(36), style: { ...defaultState.style } };
  const state37 = { ...state36, lyrics: lines(37) };
  assert.equal(evaluateMinimumExportSafety(state36, readyDom).blockingReason, null);
  assert.equal(evaluateMinimumExportSafety(state37, readyDom).blockingReason, "lyrics-limit");
  assert.equal(evaluateMinimumExportSafety(state36, { ...readyDom, areFontsReady: false }).blockingReason, "fonts-loading");
  assert.equal(evaluateMinimumExportSafety(state36, { ...readyDom, isCardSizeStable: false }).blockingReason, "card-measuring");
  assert.equal(evaluateMinimumExportSafety(state36, { ...readyDom, hasContentOverflow: true }).blockingReason, "content-overflow");
}

async function concurrencyTest() {
  const mutex = new ExportTransactionMutex();
  const snapshot = createExportSnapshot(defaultState, 1, 1);
  let releaseCapture!: () => void;
  const captureGate = new Promise<void>((resolve) => { releaseCapture = resolve; });
  let markCaptureStarted!: () => void;
  const captureStarted = new Promise<void>((resolve) => { markCaptureStarted = resolve; });
  let captureCount = 0;
  let unmountCount = 0;
  const options = {
    mutex,
    snapshot,
    mountSnapshot: async () => ({ node: true }),
    validateSnapshot: () => null,
    captureSnapshot: async () => {
      captureCount += 1;
      markCaptureStarted();
      await captureGate;
    },
    unmountSnapshot: () => { unmountCount += 1; }
  };

  const first = runExportTransaction(options);
  const second = runExportTransaction(options);
  assert.deepEqual(await second, { ok: false, kind: "busy" });
  await captureStarted;
  assert.equal(captureCount, 1, "same-turn calls must start only one capture");
  releaseCapture();
  assert.deepEqual(await first, { ok: true });
  assert.equal(unmountCount, 1);
}

function exportSnapshotProtectsBlobUrlTest() {
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const revokedUrls: string[] = [];
  URL.revokeObjectURL = (url) => {
    revokedUrls.push(url);
  };

  try {
    const snapshotCoverUrl = "blob:export-snapshot";
    const live: AppState = {
      ...defaultState,
      song: { ...defaultState.song, coverUrl: snapshotCoverUrl }
    };
    const snapshot = createExportSnapshot(live, 1, 9);
    const retirement = createBlobUrlRetirementState(live.song.coverUrl);

    assert.deepEqual(
      reconcileBlobUrlRetirement(retirement, "blob:live-next", snapshot.song.coverUrl),
      [],
      "an active export snapshot keeps its old local cover alive after the document changes"
    );
    assert.deepEqual(
      reconcileBlobUrlRetirement(retirement, "blob:live-latest", snapshot.song.coverUrl),
      ["blob:live-next"],
      "superseded live covers that are not in the snapshot can retire immediately"
    );
    assert.deepEqual(revokedUrls, ["blob:live-next"]);
    assert.deepEqual(
      reconcileBlobUrlRetirement(retirement, "blob:live-latest"),
      [snapshotCoverUrl],
      "the frozen cover retires only after the export snapshot unmounts"
    );
    assert.deepEqual(revokedUrls, ["blob:live-next", snapshotCoverUrl]);
    assert.equal(revokedUrls.includes("blob:live-latest"), false, "the current live cover remains usable");
  } finally {
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
}

async function timeoutReleasesMutexTest() {
  const mutex = new ExportTransactionMutex();
  const snapshot = createExportSnapshot(defaultState, 1, 2);
  let unmountCount = 0;
  const timedOut = await runExportTransaction({
    mutex,
    snapshot,
    mountSnapshot: async () => new Promise<never>(() => {}),
    validateSnapshot: () => null,
    captureSnapshot: async () => {},
    unmountSnapshot: () => { unmountCount += 1; },
    timeoutMs: 20
  });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.ok ? null : timedOut.kind, "error");
  assert.equal(unmountCount, 1, "a timed-out export must unmount its snapshot");

  let captureCount = 0;
  const retry = await runExportTransaction({
    mutex,
    snapshot,
    mountSnapshot: async () => ({ node: true }),
    validateSnapshot: () => null,
    captureSnapshot: async () => { captureCount += 1; },
    unmountSnapshot: () => { unmountCount += 1; }
  });
  assert.deepEqual(retry, { ok: true });
  assert.equal(captureCount, 1, "the mutex must be reusable after a timeout");
}

async function postSettleRevalidationTest() {
  const mutex = new ExportTransactionMutex();
  const snapshot = createExportSnapshot(defaultState, 1, 3);
  const dom = { overflow: false };
  let captureCount = 0;
  const result = await runExportTransaction({
    mutex,
    snapshot,
    mountSnapshot: async () => {
      // Simulate fonts/layout settling after the caller's initial live check.
      dom.overflow = true;
      return dom;
    },
    validateSnapshot: (_snapshot, node) => node.overflow ? "content-overflow" as const : null,
    captureSnapshot: async () => { captureCount += 1; },
    unmountSnapshot: () => {}
  });
  assert.deepEqual(result, { ok: false, kind: "blocked", reason: "content-overflow" });
  assert.equal(captureCount, 0, "a snapshot that destabilizes while settling must not download");
}

async function fontReadinessTimeoutTest() {
  const previousDocument = globalThis.document;
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  const neverReady = new Promise<FontFaceSet>(() => {});
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { fonts: { ready: neverReady } }
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0)
  });

  try {
    const mutex = new ExportTransactionMutex();
    const snapshot = createExportSnapshot(defaultState, 1, 4);
    const node = { dataset: { exportSnapshotId: snapshot.id } } as unknown as HTMLElement;
    const result = await runExportTransaction({
      mutex,
      snapshot,
      mountSnapshot: (_snapshot, signal) => waitForExportSnapshotNode(() => node, snapshot.id, signal, 1000),
      validateSnapshot: () => null,
      captureSnapshot: async () => assert.fail("font timeout must prevent capture"),
      unmountSnapshot: () => {},
      timeoutMs: 20
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok ? null : result.kind, "error", "fonts.ready must share the transaction deadline");
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: previousAnimationFrame });
  }
}

function deferredRender() {
  let resolve!: (value: string) => void;
  let startedResolve!: () => void;
  const started = new Promise<void>((resolvePromise) => { startedResolve = resolvePromise; });
  const promise = new Promise<string>((resolvePromise) => { resolve = resolvePromise; });
  return {
    renderNode: async () => {
      startedResolve();
      return promise;
    },
    started,
    resolve
  };
}

async function exportImageAbortGuardTest() {
  const render = deferredRender();
  const commits: Array<{ dataUrl: string; fileName: string }> = [];
  const dependencies: ExportImageDependencies = {
    renderNode: render.renderNode,
    commitDownload: (dataUrl, fileName) => { commits.push({ dataUrl, fileName }); }
  };
  const controller = new AbortController();
  const exporting = exportNodeAsPng(
    {} as HTMLElement,
    "cancelled.png",
    1200,
    1800,
    2,
    controller.signal,
    dependencies
  );
  await render.started;
  controller.abort(new Error("cancelled during render"));
  render.resolve("data:image/png;base64,LATE");
  await assert.rejects(exporting, /cancelled during render/);
  assert.equal(commits.length, 0, "an aborted production export must never reach link.click/commit");

  let normalRenderCount = 0;
  await exportNodeAsPng(
    {} as HTMLElement,
    "normal.png",
    640,
    960,
    1,
    undefined,
    {
      renderNode: async (_node, format, options) => {
        normalRenderCount += 1;
        assert.equal(format, "png");
        assert.equal(options.width, 640);
        assert.equal(options.height, 960);
        return "data:image/png;base64,OK";
      },
      commitDownload: (dataUrl, fileName) => { commits.push({ dataUrl, fileName }); }
    }
  );
  assert.equal(normalRenderCount, 1);
  assert.deepEqual(commits, [{ dataUrl: "data:image/png;base64,OK", fileName: "normal.png" }]);

  await exportNodeAsImage(
    {} as HTMLElement,
    "normal.webp",
    "webp",
    640,
    960,
    1.4,
    undefined,
    {
      renderNode: async (_node, format, options) => {
        assert.equal(format, "webp");
        assert.equal(options.pixelRatio, 1.4);
        return "data:image/webp;base64,OK";
      },
      commitDownload: (dataUrl, fileName) => { commits.push({ dataUrl, fileName }); }
    }
  );
  assert.deepEqual(commits[1], { dataUrl: "data:image/webp;base64,OK", fileName: "normal.webp" });

  await exportNodeAsImage(
    {} as HTMLElement,
    "normal.jpg",
    "jpg",
    640,
    960,
    2,
    undefined,
    {
      renderNode: async (_node, format) => {
        assert.equal(format, "jpg");
        return "data:image/jpeg;base64,OK";
      },
      commitDownload: (dataUrl, fileName) => { commits.push({ dataUrl, fileName }); }
    }
  );
  assert.deepEqual(commits[2], { dataUrl: "data:image/jpeg;base64,OK", fileName: "normal.jpg" });

  await assert.rejects(
    exportNodeAsImage(
      {} as HTMLElement,
      "mismatch.jpg",
      "jpg",
      640,
      960,
      1,
      undefined,
      {
        renderNode: async () => "data:image/png;base64,WRONG",
        commitDownload: () => assert.fail("a MIME mismatch must not commit a download")
      }
    ),
    /does not match the requested JPG format/
  );
}

async function transactionTimeoutBlocksLateExportCommitTest() {
  const mutex = new ExportTransactionMutex();
  const snapshot = createExportSnapshot(defaultState, 1, 5);
  const render = deferredRender();
  let commitCount = 0;
  const resultPromise = runExportTransaction({
    mutex,
    snapshot,
    mountSnapshot: async () => ({} as HTMLElement),
    validateSnapshot: () => null,
    captureSnapshot: (current, node, signal) => exportNodeAsPng(
      node,
      current.fileName,
      current.width,
      current.height,
      current.pixelRatio,
      signal,
      {
        renderNode: render.renderNode,
        commitDownload: () => { commitCount += 1; }
      }
    ),
    unmountSnapshot: () => undefined,
    timeoutMs: 20
  });
  await render.started;
  const result = await resultPromise;
  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.kind, "error");
  render.resolve("data:image/png;base64,LATE");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(commitCount, 0, "a transaction timeout must block a late html-to-image result from downloading");
}

void (async () => {
  exportSnapshotProtectsBlobUrlTest();
  await concurrencyTest();
  await timeoutReleasesMutexTest();
  await postSettleRevalidationTest();
  await fontReadinessTimeoutTest();
  await exportImageAbortGuardTest();
  await transactionTimeoutBlocksLateExportCommitTest();
})().then(() => {
  console.log("export snapshot and concurrency tests passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
