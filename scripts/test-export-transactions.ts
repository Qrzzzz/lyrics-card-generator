import assert from "node:assert/strict";
import { defaultState } from "../components/editor/editor-defaults";
import { evaluateMinimumExportSafety, type ExportDomSafety } from "../lib/export-safety";
import { createExportSnapshot } from "../lib/export-snapshot";
import { ExportTransactionMutex, runExportTransaction, waitForExportSnapshotNode } from "../lib/export-transaction";
import type { AppState } from "../lib/types";

const readyDom: ExportDomSafety = {
  isCardMounted: true,
  areFontsReady: true,
  isCardSizeStable: true,
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
  assert.equal(snapshot.fileName, "lyric-card-Snapshot-Song.png");
  assert.equal(snapshot.revision, 42);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.song), true);
  assert.equal(Object.isFrozen(snapshot.style), true);
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

void (async () => {
  await concurrencyTest();
  await timeoutReleasesMutexTest();
  await postSettleRevalidationTest();
  await fontReadinessTimeoutTest();
})().then(() => {
  console.log("export snapshot and concurrency tests passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
